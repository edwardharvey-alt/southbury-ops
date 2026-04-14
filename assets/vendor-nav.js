// assets/vendor-nav.js
// HearthNav — tiny helper that makes the ?vendor=<slug> URL param sticky
// across operator navigation.
//
// This script is loaded synchronously in the <head> of every operator
// page, before the body is parsed. Each page renders its nav bar with an
// inline <script>HearthNav.renderNav(...)</script> call placed directly
// after an empty nav placeholder, so the fully-decorated nav appears at
// the moment the parser reaches it — no post-render rewrite, no observer
// races.
//
// Page JS that generates operator links inside template literals (e.g.
// home.html recommendation CTAs, drop-manager.html scorecard links) should
// wrap the href in HearthNav.withVendor() at the point of generation, so
// the vendor param is embedded on the first render instead of being
// patched on afterwards.
//
// Customer-facing pages (order.html, order-confirmation.html) and host-
// facing pages (host-view.html) intentionally do not load this script —
// the vendor slug should not appear in URLs those audiences see.
(function () {
  "use strict";

  function readVendorSlug() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("vendor") || params.get("vendor_slug") || null;
    } catch (e) {
      return null;
    }
  }

  var slug = readVendorSlug();
  var vendorParam = slug ? "?vendor=" + encodeURIComponent(slug) : "";

  // Append ?vendor=<slug> (or &vendor=<slug>) to an internal .html href.
  // Returns the href unchanged if there is no current vendor slug, the
  // target is not a relative .html link, or the vendor param is already
  // present.
  function withVendor(href) {
    if (!slug || !href) return href;
    var trimmed = String(href).trim();
    if (!trimmed) return href;
    if (trimmed.charAt(0) === "#") return href;
    if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) return href;
    if (/^(https?:)?\/\//i.test(trimmed)) return href;
    var pathPart = trimmed.split("?")[0].split("#")[0];
    if (!/\.html$/i.test(pathPart)) return href;
    if (/[?&]vendor=/.test(trimmed)) return href;
    var sep = trimmed.indexOf("?") === -1 ? "?" : "&";
    return trimmed + sep + "vendor=" + encodeURIComponent(slug);
  }

  // Canonical list of operator pages shown in the platform nav bar.
  var NAV_ITEMS = [
    { file: "home.html", label: "Home" },
    { file: "brand-hearth.html", label: "Brand Hearth" },
    { file: "drop-menu.html", label: "Menu Library" },
    { file: "drop-manager.html", label: "Drop Studio" },
    { file: "hosts.html", label: "Hosts", utility: true },
    { file: "index.html", label: "Service Board" },
    { file: "insights.html", label: "Insights" },
    { file: "customers.html", label: "Customers" },
    { file: "onboarding.html", label: "Setup", utility: true }
  ];

  // Full whitelist of operator pages — nav bar items plus operator
  // workspace pages that are reachable via content CTAs but not shown
  // directly in the nav (customers, scorecard, customer-import, legacy
  // order-entry). decorateLinks() only touches anchors pointing at one of
  // these files, so customer-facing URLs (order.html, order-confirmation,
  // host-view) are never accidentally decorated with a vendor slug.
  var OPERATOR_PAGES = {
    "home.html": true,
    "brand-hearth.html": true,
    "drop-menu.html": true,
    "drop-manager.html": true,
    "index.html": true,
    "insights.html": true,
    "onboarding.html": true,
    "customers.html": true,
    "customer-import.html": true,
    "scorecard.html": true,
    "order-entry.html": true,
    "hosts.html": true,
    "host-profile.html": true
  };

  function isOperatorHref(trimmed) {
    var pathPart = trimmed.split("?")[0].split("#")[0];
    var segments = pathPart.split("/");
    var file = segments[segments.length - 1];
    return Object.prototype.hasOwnProperty.call(OPERATOR_PAGES, file);
  }

  function escapeAttr(v) {
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Render the operator nav into `target` (a selector, element, or id).
  // activeFile is the filename (e.g. "drop-manager.html") of the current
  // page — that link gets the "active" class. Options:
  //   dotSlash: prefix each href with "./" (matches home.html styling).
  function renderNav(target, activeFile, opts) {
    opts = opts || {};
    var container = null;
    if (typeof target === "string") {
      // Accept "#id", ".class", or a bare id.
      if (target.charAt(0) === "#" || target.charAt(0) === ".") {
        container = document.querySelector(target);
      } else {
        container = document.getElementById(target) || document.querySelector(target);
      }
    } else if (target && target.nodeType === 1) {
      container = target;
    }
    if (!container) return;

    var prefix = opts.dotSlash ? "./" : "";
    var html = NAV_ITEMS.map(function (item) {
      var rawHref = prefix + item.file;
      var href = withVendor(rawHref);
      var isActive = item.file === activeFile;
      var classes = [];
      if (item.utility) classes.push("utility");
      if (isActive) classes.push("active");
      var classAttr = classes.length ? ' class="' + classes.join(" ") + '"' : "";
      return (
        '<a href="' + escapeAttr(href) + '"' +
        classAttr +
        ">" + item.label + "</a>"
      );
    }).join("");

    container.innerHTML = html;
  }

  // Decorate every anchor in `root` (default: document) that points at an
  // operator HTML page so its href carries the current vendor slug. This
  // is called inline as the final script tag inside each page's <body>,
  // which runs synchronously the moment the parser reaches the end of the
  // document — before DOMContentLoaded fires, and before any network-
  // driven data load can render further content. It covers static content
  // CTAs that live outside the JS template literal render path. JS that
  // builds link HTML dynamically should call withVendor() at template
  // construction time instead of relying on this sweep.
  function decorateLinks(root) {
    if (!slug) return;
    var scope = root && root.querySelectorAll ? root : document;
    var anchors = scope.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var current = a.getAttribute("href");
      if (!current) continue;
      var trimmed = String(current).trim();
      if (!trimmed) continue;
      if (trimmed.charAt(0) === "#") continue;
      if (/^(https?:)?\/\//i.test(trimmed)) continue;
      if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) continue;
      if (!isOperatorHref(trimmed)) continue;
      var next = withVendor(current);
      if (next !== current) {
        a.setAttribute("href", next);
      }
    }
  }

  window.HearthNav = {
    slug: slug,
    vendorParam: vendorParam,
    withVendor: withVendor,
    renderNav: renderNav,
    decorateLinks: decorateLinks
  };
})();
