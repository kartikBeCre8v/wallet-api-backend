const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";

console.log("DOMAIN:", SHOPIFY_STORE_DOMAIN);
console.log(
  "TOKEN START:",
  SHOPIFY_ADMIN_ACCESS_TOKEN?.substring(0, 15)
);

export async function createShopifyDiscountCode({
  code,
  discountPaise,
  expiresAt,
}) {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    throw new Error("Shopify env variables missing");
  }

  const discountAmount = (Number(discountPaise) / 100).toFixed(2);

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
console.log(
  `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
);
  const response = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: mutation,
        variables,
      }),
    }
  );

const data = await response.json();

console.log("Shopify response:", JSON.stringify(data, null, 2));

if (!response.ok) {
  throw new Error(`Shopify HTTP Error: ${response.status}`);
}

if (data.errors) {
  throw new Error(data.errors.map((e) => e.message).join(", "));
}

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