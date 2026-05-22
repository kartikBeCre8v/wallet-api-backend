/**
 * ╔══════════════════════════════════════════════╗
 * ║   Cre8v Coins — Embeddable Wallet Widget     ║
 * ║   Version: 1.0.0                             ║
 * ║   Backend: Node.js + Express + Socket.IO     ║
 * ╚══════════════════════════════════════════════╝
 *
 * EMBED ON ANY SITE:
 *   <script src="http://localhost:3000/widget.js"></script>
 *
 * OPTIONAL — pass token before the script tag:
 *   <script>window.WALLET_TOKEN = "your-jwt-here";</script>
 *
 * OPTIONAL — custom backend URL:
 *   <script>window.WALLET_API_URL = "https://api.example.com";</script>
 */

(function () {
  "use strict";

  // ─── CONFIG ──────────────────────────────────────────────────────────────────

  var API_BASE =
    (typeof window !== "undefined" && window.WALLET_API_URL) ||
    "http://localhost:3000";

  var SOCKET_IO_CDN =
    "https://cdn.socket.io/4.7.5/socket.io.min.js";

  var SPEND_URL = "https://becre8v.com";
  var DAILY_CAP = 200; // max coins from gaming per day

  // ─── PREFIX ──────────────────────────────────────────────────────────────────

  var PFX = "wallet-widget-";

  // ─── STATE ───────────────────────────────────────────────────────────────────

  var state = {
    token: null,
    balance: 0,
    transactions: [],
    dailyCapReached: false,
    isOpen: false,
    isLoading: true,
    hasError: false,
    errorMsg: "",
    socket: null,
    animFrame: null,
  };

  // ─── TOKEN RESOLUTION ────────────────────────────────────────────────────────

  function getToken() {
    // Priority: window.WALLET_TOKEN > localStorage
    if (
      typeof window !== "undefined" &&
      window.WALLET_TOKEN &&
      typeof window.WALLET_TOKEN === "string"
    ) {
      return window.WALLET_TOKEN;
    }
    try {
      return localStorage.getItem("token") || null;
    } catch (e) {
      return null;
    }
  }

  // ─── INJECT STYLES ───────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(PFX + "styles")) return;

    var css = [
      /* === Reset / Base === */
      "#" + PFX + "root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; }",

      /* === Badge (floating pill) === */
      "#" + PFX + "badge {",
      "  position: fixed;",
      "  bottom: 24px;",
      "  right: 24px;",
      "  z-index: 2147483647;",
      "  background: #111;",
      "  color: #fff;",
      "  border-radius: 999px;",
      "  padding: 10px 18px;",
      "  font-size: 15px;",
      "  font-weight: 600;",
      "  cursor: pointer;",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 7px;",
      "  box-shadow: 0 4px 20px rgba(0,0,0,0.35);",
      "  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s;",
      "  user-select: none;",
      "  border: 1.5px solid rgba(255,255,255,0.08);",
      "}",
      "#" + PFX + "badge:hover {",
      "  transform: translateY(-2px) scale(1.03);",
      "  box-shadow: 0 8px 28px rgba(0,0,0,0.45);",
      "  background: #1a1a1a;",
      "}",
      "#" + PFX + "badge.pulse {",
      "  animation: " + PFX + "pulse 0.55s ease;",
      "}",
      "@keyframes " + PFX + "pulse {",
      "  0%   { transform: scale(1); box-shadow: 0 4px 20px rgba(0,0,0,0.35); }",
      "  40%  { transform: scale(1.12); box-shadow: 0 8px 32px rgba(255,200,0,0.45); }",
      "  100% { transform: scale(1); box-shadow: 0 4px 20px rgba(0,0,0,0.35); }",
      "}",

      /* === Loading spinner === */
      "#" + PFX + "spinner {",
      "  width: 16px; height: 16px;",
      "  border: 2px solid rgba(255,255,255,0.3);",
      "  border-top-color: #fff;",
      "  border-radius: 50%;",
      "  animation: " + PFX + "spin 0.7s linear infinite;",
      "}",
      "@keyframes " + PFX + "spin {",
      "  to { transform: rotate(360deg); }",
      "}",

      /* === Panel === */
      "#" + PFX + "panel {",
      "  position: fixed;",
      "  bottom: 88px;",
      "  right: 24px;",
      "  z-index: 2147483646;",
      "  width: 300px;",
      "  background: #111;",
      "  border-radius: 16px;",
      "  box-shadow: 0 12px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);",
      "  color: #fff;",
      "  border: 1.5px solid rgba(255,255,255,0.1);",
      "  overflow: hidden;",
      "  transform-origin: bottom right;",
      "  transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.175,0.885,0.32,1.275);",
      "  opacity: 0;",
      "  transform: scale(0.88) translateY(12px);",
      "  pointer-events: none;",
      "}",
      "#" + PFX + "panel.open {",
      "  opacity: 1;",
      "  transform: scale(1) translateY(0);",
      "  pointer-events: auto;",
      "}",

      /* === Panel header === */
      "#" + PFX + "panel-header {",
      "  background: linear-gradient(135deg, #1c1c1c 0%, #2a2a2a 100%);",
      "  padding: 20px;",
      "  border-bottom: 1px solid rgba(255,255,255,0.08);",
      "  text-align: center;",
      "}",
      "#" + PFX + "panel-title {",
      "  font-size: 11px;",
      "  font-weight: 600;",
      "  letter-spacing: 2px;",
      "  text-transform: uppercase;",
      "  color: rgba(255,255,255,0.5);",
      "  margin-bottom: 8px;",
      "}",
      "#" + PFX + "balance-big {",
      "  font-size: 38px;",
      "  font-weight: 800;",
      "  letter-spacing: -1px;",
      "  line-height: 1;",
      "  color: #fff;",
      "}",
      "#" + PFX + "balance-big span.coin-icon { font-size: 28px; margin-right: 4px; }",
      "#" + PFX + "rupee-value {",
      "  font-size: 12px;",
      "  color: rgba(255,255,255,0.45);",
      "  margin-top: 4px;",
      "}",

      /* === Daily cap banner === */
      "#" + PFX + "cap-banner {",
      "  background: rgba(255,165,0,0.15);",
      "  border-top: 1px solid rgba(255,165,0,0.3);",
      "  padding: 8px 16px;",
      "  font-size: 12px;",
      "  color: #ffb347;",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 6px;",
      "}",

      /* === Transactions === */
      "#" + PFX + "txn-list {",
      "  padding: 12px 16px;",
      "  max-height: 220px;",
      "  overflow-y: auto;",
      "}",
      "#" + PFX + "txn-list::-webkit-scrollbar { width: 4px; }",
      "#" + PFX + "txn-list::-webkit-scrollbar-track { background: transparent; }",
      "#" + PFX + "txn-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }",
      "." + PFX + "txn-label {",
      "  font-size: 11px;",
      "  font-weight: 600;",
      "  letter-spacing: 1.5px;",
      "  text-transform: uppercase;",
      "  color: rgba(255,255,255,0.35);",
      "  margin-bottom: 8px;",
      "}",
      "." + PFX + "txn-item {",
      "  display: flex;",
      "  justify-content: space-between;",
      "  align-items: center;",
      "  padding: 8px 0;",
      "  border-bottom: 1px solid rgba(255,255,255,0.06);",
      "}",
      "." + PFX + "txn-item:last-child { border-bottom: none; }",
      "." + PFX + "txn-desc {",
      "  font-size: 13px;",
      "  color: rgba(255,255,255,0.8);",
      "  flex: 1;",
      "  white-space: nowrap;",
      "  overflow: hidden;",
      "  text-overflow: ellipsis;",
      "  margin-right: 8px;",
      "}",
      "." + PFX + "txn-date {",
      "  font-size: 10px;",
      "  color: rgba(255,255,255,0.3);",
      "  display: block;",
      "}",
      "." + PFX + "txn-amount {",
      "  font-size: 13px;",
      "  font-weight: 700;",
      "  white-space: nowrap;",
      "}",
      "." + PFX + "txn-earn { color: #4ade80; }",
      "." + PFX + "txn-spend { color: #f87171; }",

      /* === Empty state === */
      "." + PFX + "empty {",
      "  text-align: center;",
      "  padding: 24px 16px;",
      "  color: rgba(255,255,255,0.3);",
      "  font-size: 13px;",
      "}",

      /* === Spend button === */
      "#" + PFX + "footer {",
      "  padding: 12px 16px;",
      "  border-top: 1px solid rgba(255,255,255,0.07);",
      "}",
      "#" + PFX + "spend-btn {",
      "  display: block;",
      "  width: 100%;",
      "  padding: 11px;",
      "  background: linear-gradient(135deg, #f59e0b, #f97316);",
      "  color: #fff;",
      "  text-align: center;",
      "  text-decoration: none;",
      "  border-radius: 10px;",
      "  font-size: 14px;",
      "  font-weight: 700;",
      "  letter-spacing: 0.3px;",
      "  transition: opacity 0.15s ease, transform 0.15s ease;",
      "  cursor: pointer;",
      "}",
      "#" + PFX + "spend-btn:hover {",
      "  opacity: 0.9;",
      "  transform: translateY(-1px);",
      "}",

      /* === Error / Login === */
      "." + PFX + "status-msg {",
      "  padding: 18px 16px;",
      "  text-align: center;",
      "  font-size: 13px;",
      "  color: rgba(255,255,255,0.55);",
      "  line-height: 1.5;",
      "}",
    ].join("\n");

    var style = document.createElement("style");
    style.id = PFX + "styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── BUILD DOM ───────────────────────────────────────────────────────────────

  function buildDOM() {
    if (document.getElementById(PFX + "root")) return;

    var root = document.createElement("div");
    root.id = PFX + "root";

    // Badge
    var badge = document.createElement("div");
    badge.id = PFX + "badge";
    badge.setAttribute("role", "button");
    badge.setAttribute("aria-label", "Open Cre8v Coins wallet");
    badge.setAttribute("tabindex", "0");
    badge.innerHTML =
      "<div id='" + PFX + "spinner'></div>" +
      "<span id='" + PFX + "badge-text'></span>";

    // Panel
    var panel = document.createElement("div");
    panel.id = PFX + "panel";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML =
      "<div id='" + PFX + "panel-header'>" +
        "<div id='" + PFX + "panel-title'>Cre8v Coins &#8355;</div>" +
        "<div id='" + PFX + "balance-big'>" +
          "<span class='coin-icon'>&#x1F4B0;</span>" +
          "<span id='" + PFX + "balance-num'>0</span>" +
        "</div>" +
        "<div id='" + PFX + "rupee-value'></div>" +
      "</div>" +
      "<div id='" + PFX + "cap-banner' style='display:none'>" +
        "&#9888;&#65039; Daily earning limit reached (200 &#8355;)" +
      "</div>" +
      "<div id='" + PFX + "panel-body'></div>" +
      "<div id='" + PFX + "footer'>" +
        "<a id='" + PFX + "spend-btn' href='" + SPEND_URL + "' target='_blank' rel='noopener'>" +
          "&#127873; Spend Coins at Be Cre8v" +
        "</a>" +
      "</div>";

    root.appendChild(badge);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  function el(id) {
    return document.getElementById(PFX + id);
  }

  function formatDate(dateStr) {
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function rupeeValue(coins) {
    return "≈ ₹" + (coins * 0.10).toFixed(2);
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  function renderBadge() {
    var spinner = el("spinner");
    var badgeText = el("badge-text");

    if (!spinner || !badgeText) return;

    if (state.isLoading) {
      spinner.style.display = "block";
      badgeText.textContent = "";
      return;
    }

    spinner.style.display = "none";

    if (!state.token) {
      badgeText.textContent = "🔒 Login required";
      return;
    }

    if (state.hasError) {
      badgeText.textContent = "⚠️ Wallet error";
      return;
    }

    badgeText.textContent = "💰 " + state.balance;
  }

  function renderPanel() {
    // Balance big display
    var balNum = el("balance-num");
    if (balNum) balNum.textContent = state.balance;

    var rupee = el("rupee-value");
    if (rupee) rupee.textContent = rupeeValue(state.balance);

    // Daily cap banner
    var capBanner = el("cap-banner");
    if (capBanner) {
      capBanner.style.display = state.dailyCapReached ? "flex" : "none";
    }

    // Panel body (transactions OR status msg)
    var body = el("panel-body");
    if (!body) return;

    if (!state.token) {
      body.innerHTML =
        "<div class='" + PFX + "status-msg'>🔒 Please log in to view your wallet.</div>";
      return;
    }

    if (state.hasError) {
      body.innerHTML =
        "<div class='" + PFX + "status-msg'>⚠️ " + (state.errorMsg || "Error loading wallet") + "</div>";
      return;
    }

    if (state.isLoading) {
      body.innerHTML =
        "<div class='" + PFX + "status-msg'>Loading transactions…</div>";
      return;
    }

    var txns = state.transactions.slice(0, 5);

    if (txns.length === 0) {
      body.innerHTML =
        "<div id='" + PFX + "txn-list'>" +
          "<div class='" + PFX + "empty'>No transactions yet. Start playing to earn coins!</div>" +
        "</div>";
      return;
    }

    var html = "<div id='" + PFX + "txn-list'>" +
      "<div class='" + PFX + "txn-label'>Recent Activity</div>";

    for (var i = 0; i < txns.length; i++) {
      var t = txns[i];
      var isEarn = (t.type === "EARN");
      var sign = isEarn ? "+" : "−";
      var cls = isEarn ? PFX + "txn-earn" : PFX + "txn-spend";

      html +=
        "<div class='" + PFX + "txn-item'>" +
          "<div class='" + PFX + "txn-desc'>" +
            "<span>" + (t.description || t.source || "Transaction") + "</span>" +
            "<span class='" + PFX + "txn-date'>" + formatDate(t.createdAt) + "</span>" +
          "</div>" +
          "<span class='" + PFX + "txn-amount " + cls + "'>" +
            sign + t.amount + " ₵" +
          "</span>" +
        "</div>";
    }

    html += "</div>";
    body.innerHTML = html;
  }

  function render() {
    renderBadge();
    renderPanel();
  }

  // ─── ANIMATE BALANCE ─────────────────────────────────────────────────────────

  function animateBalance(from, to) {
    var start = null;
    var duration = 600; // ms
    var diff = to - from;

    if (diff <= 0) {
      state.balance = to;
      render();
      return;
    }

    // Pulse effect on badge
    var badge = el("badge");
    if (badge) {
      badge.classList.remove("pulse");
      // Force reflow so animation replays
      void badge.offsetWidth; // eslint-disable-line
      badge.classList.add("pulse");
      setTimeout(function () {
        badge.classList.remove("pulse");
      }, 600);
    }

    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      // easeOutCubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(from + diff * eased);

      state.balance = current;
      render();

      if (progress < 1) {
        state.animFrame = requestAnimationFrame(step);
      } else {
        state.balance = to;
        render();
      }
    }

    if (state.animFrame) cancelAnimationFrame(state.animFrame);
    state.animFrame = requestAnimationFrame(step);
  }

  // ─── API CALLS ───────────────────────────────────────────────────────────────

  function apiFetch(path, method, body) {
    var opts = {
      method: method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + state.token,
      },
    };
    if (body) opts.body = JSON.stringify(body);

    return fetch(API_BASE + path, opts).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function fetchBalance() {
    return apiFetch("/wallet/balance").then(function (data) {
      return data.balance || 0;
    });
  }

  function fetchTransactions() {
    return apiFetch("/wallet/transactions").then(function (data) {
      return Array.isArray(data) ? data : [];
    });
  }

  // ─── INIT DATA ───────────────────────────────────────────────────────────────

  function loadWalletData() {
    if (!state.token) {
      state.isLoading = false;
      render();
      return;
    }

    state.isLoading = true;
    render();

    Promise.all([fetchBalance(), fetchTransactions()])
      .then(function (results) {
        var balance = results[0];
        var transactions = results[1];

        // Check daily cap from transactions
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var earnedToday = 0;
        for (var i = 0; i < transactions.length; i++) {
          var t = transactions[i];
          if (
            t.type === "EARN" &&
            t.sourcePlatform === "GAMES" &&
            new Date(t.createdAt) >= today
          ) {
            earnedToday += t.amount || 0;
          }
        }

        state.balance = balance;
        state.transactions = transactions;
        state.dailyCapReached = earnedToday >= DAILY_CAP;
        state.isLoading = false;
        state.hasError = false;

        render();
      })
      .catch(function (err) {
        console.warn("[Cre8v Wallet Widget] Failed to load data:", err.message);
        state.isLoading = false;
        state.hasError = true;
        state.errorMsg = "Error loading wallet";
        render();
      });
  }

  // ─── SOCKET.IO ───────────────────────────────────────────────────────────────

  function connectSocket() {
    if (!state.token) return;
    if (typeof window.io !== "function") return;

    try {
      var socket = window.io(API_BASE, {
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      state.socket = socket;

      socket.on("connect", function () {
        // We need userId to join wallet room.
        // Decode JWT payload (base64) to get sub/user id.
        var userId = decodeJwtUserId(state.token);
        if (userId) {
          socket.emit("join-wallet", userId);
        }
      });

      socket.on("wallet-updated", function (data) {
        if (data && typeof data.balance === "number") {
          var oldBalance = state.balance;
          // Refresh transactions in background
          fetchTransactions()
            .then(function (txns) {
              state.transactions = txns;
              // Check daily cap
              var today = new Date();
              today.setHours(0, 0, 0, 0);
              var earnedToday = 0;
              for (var i = 0; i < txns.length; i++) {
                var t = txns[i];
                if (
                  t.type === "EARN" &&
                  t.sourcePlatform === "GAMES" &&
                  new Date(t.createdAt) >= today
                ) {
                  earnedToday += t.amount || 0;
                }
              }
              state.dailyCapReached = earnedToday >= DAILY_CAP;
            })
            .catch(function () {});

          animateBalance(oldBalance, data.balance);
        }
      });

      socket.on("disconnect", function () {
        console.log("[Cre8v Wallet Widget] Socket disconnected");
      });

      socket.on("connect_error", function (err) {
        console.warn("[Cre8v Wallet Widget] Socket error:", err && err.message);
      });
    } catch (e) {
      console.warn("[Cre8v Wallet Widget] Socket.IO init failed:", e.message);
    }
  }

  // JWT payload decoder (no verify — just read userId from sub claim)
  function decodeJwtUserId(token) {
    try {
      var parts = token.split(".");
      if (parts.length < 2) return null;
      var payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.sub || payload.userId || payload.id || null;
    } catch (e) {
      return null;
    }
  }

  // ─── SOCKET.IO LOADER ────────────────────────────────────────────────────────

  function loadSocketIO(callback) {
    if (typeof window.io === "function") {
      callback();
      return;
    }

    var script = document.createElement("script");
    script.src = SOCKET_IO_CDN;
    script.onload = callback;
    script.onerror = function () {
      console.warn("[Cre8v Wallet Widget] Failed to load Socket.IO CDN. Real-time updates disabled.");
    };
    document.head.appendChild(script);
  }

  // ─── PANEL TOGGLE ────────────────────────────────────────────────────────────

  function openPanel() {
    state.isOpen = true;
    var panel = el("panel");
    if (panel) panel.classList.add("open");

    // Refresh data on open
    if (state.token && !state.isLoading) {
      fetchTransactions()
        .then(function (txns) {
          state.transactions = txns;
          render();
        })
        .catch(function () {});
    }
  }

  function closePanel() {
    state.isOpen = false;
    var panel = el("panel");
    if (panel) panel.classList.remove("open");
  }

  function togglePanel() {
    if (state.isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  // ─── EVENTS ──────────────────────────────────────────────────────────────────

  function bindEvents() {
    var badge = el("badge");
    if (badge) {
      badge.addEventListener("click", togglePanel);
      badge.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePanel();
        }
      });
    }

    // Close on outside click
    document.addEventListener("click", function (e) {
      if (!state.isOpen) return;
      var root = document.getElementById(PFX + "root");
      if (root && !root.contains(e.target)) {
        closePanel();
      }
    });

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.isOpen) closePanel();
    });
  }

  // ─── BOOTSTRAP ───────────────────────────────────────────────────────────────

  function init() {
    // Prevent double-init
    if (window.__cre8vWalletInit) return;
    window.__cre8vWalletInit = true;

    injectStyles();
    buildDOM();
    bindEvents();

    state.token = getToken();

    // Initial render (loading state)
    render();

    // Load wallet data
    loadWalletData();

    // Load Socket.IO then connect
    loadSocketIO(function () {
      connectSocket();
    });

    // Poll for token changes (useful for SPAs where login happens after widget load)
    var tokenPollInterval = setInterval(function () {
      var newToken = getToken();
      if (newToken !== state.token) {
        state.token = newToken;

        // Disconnect old socket
        if (state.socket) {
          try { state.socket.disconnect(); } catch (e) {}
          state.socket = null;
        }

        // Reload wallet
        loadWalletData();

        // Reconnect socket
        if (typeof window.io === "function") {
          connectSocket();
        }
      }
    }, 3000);

    // Expose public API
    window.Cre8vWallet = {
      open: openPanel,
      close: closePanel,
      toggle: togglePanel,
      refresh: loadWalletData,
      getBalance: function () { return state.balance; },
      destroy: function () {
        clearInterval(tokenPollInterval);
        if (state.socket) {
          try { state.socket.disconnect(); } catch (e) {}
        }
        var root = document.getElementById(PFX + "root");
        if (root) root.remove();
        var styles = document.getElementById(PFX + "styles");
        if (styles) styles.remove();
        window.__cre8vWalletInit = false;
        delete window.Cre8vWallet;
      },
    };
  }

  // ─── WAIT FOR DOM ────────────────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
