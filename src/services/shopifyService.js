const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

let cachedShopifyToken = null;
let cachedTokenExpiry = 0;
let tokenRequestInProgress = null;

async function getShopifyAccessToken() {
  const now = Date.now();

  // Use cached token if it is still valid for at least 5 more minutes
  if (cachedShopifyToken && now < cachedTokenExpiry - 5 * 60 * 1000) {
    return cachedShopifyToken;
  }

  // Prevent multiple parallel token requests
  if (tokenRequestInProgress) {
    return tokenRequestInProgress;
  }

  tokenRequestInProgress = (async () => {
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
      throw new Error(
        "Shopify env variables missing: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET"
      );
    }

    const response = await fetch(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: SHOPIFY_CLIENT_ID,
          client_secret: SHOPIFY_CLIENT_SECRET,
          grant_type: "client_credentials",
        }),
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      tokenRequestInProgress = null;
      throw new Error(
        `Shopify token error: ${response.status} ${JSON.stringify(data)}`
      );
    }

    if (!data?.access_token) {
      tokenRequestInProgress = null;
      throw new Error(
        `Shopify token missing in response: ${JSON.stringify(data)}`
      );
    }

    cachedShopifyToken = data.access_token;

    // Shopify client_credentials token is generally 24 hours.
    // If Shopify returns expires_in, use it. Otherwise safely assume 24 hours.
    const expiresInSeconds = Number(data.expires_in || 86400);
    cachedTokenExpiry = Date.now() + expiresInSeconds * 1000;

    tokenRequestInProgress = null;

    console.log(
      "Shopify access token refreshed. Expires at:",
      new Date(cachedTokenExpiry).toISOString()
    );

    return cachedShopifyToken;
  })();

  try {
    return await tokenRequestInProgress;
  } catch (error) {
    tokenRequestInProgress = null;
    throw error;
  }
}

async function shopifyGraphQL(query, variables = {}) {
  const accessToken = await getShopifyAccessToken();

  const response = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    }
  );

  const data = await response.json().catch(() => null);

  console.log("Shopify response:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(
      `Shopify HTTP Error: ${response.status} ${JSON.stringify(data)}`
    );
  }

  if (data?.errors) {
    throw new Error(data.errors.map((e) => e.message).join(", "));
  }

  return data;
}

export async function createShopifyDiscountCode({
  code,
  discountPaise,
  expiresAt,
  minimumSubtotalPaise,
}) {
  if (!SHOPIFY_STORE_DOMAIN) {
    throw new Error("SHOPIFY_STORE_DOMAIN env variable missing");
  }

  const discountAmount = (Number(discountPaise) / 100).toFixed(2);
  const minimumSubtotal =
(Number(minimumSubtotalPaise) / 100)
.toFixed(2);

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    basicCodeDiscount: {
      title: `Cre8v Coins ${code}`,
      code,
      startsAt: new Date().toISOString(),
      endsAt: expiresAt.toISOString(),
      usageLimit: 1,
      minimumRequirement: {
  subtotal: {
    greaterThanOrEqualToSubtotal: minimumSubtotal
  }
},
      appliesOncePerCustomer: true,
      customerSelection: {
        all: true,
      },
      customerGets: {
        value: {
          discountAmount: {
            amount: discountAmount,
            appliesOnEachItem: false,
          },
        },
        items: {
          all: true,
        },
      },
    },
  };

  const data = await shopifyGraphQL(mutation, variables);
  

  const result = data?.data?.discountCodeBasicCreate;

  if (!result) {
    throw new Error("Shopify discountCodeBasicCreate result missing");
  }
  

  const errors = result.userErrors || [];

  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }

  return result.codeDiscountNode.id;
}