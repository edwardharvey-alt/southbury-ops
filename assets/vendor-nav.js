// assets/vendor-nav.js
// Preserves the ?vendor=<slug> URL param across internal operator navigation.
//
// Reads the vendor slug from the current page URL. If present, rewrites
// every anchor on the page whose href points at an operator HTML page so
// that the ?vendor= param is carried over. Runs on DOMContentLoaded and
// again whenever new anchors are inserted into the DOM (e.g. JS-rendered
// cards, templated recommendation strips, dynamically generated scorecard
// links). Existing query params on the anchor (e.g. ?drop=<id>) are
// preserved.
//
// Customer-facing pages (order.html, order-confirmation.html) and host-
// facing pages (host-view.html) are intentionally excluded — the vendor
// for those is resolved from the drop context, not from a URL slug the
// customer should see.
(function () {
  "use strict";

  // Whitelist of operator page filenames that should carry ?vendor=.
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
    "order-entry.html": true
  };

  function getVendorSlug() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("vendor") || params.get("vendor_slug") || null;
    } catch (e) {
      return null;
    }
  }

  function isOperatorHtmlHref(rawHref) {
    if (!rawHref) return false;
    var trimmed = String(rawHref).trim();
    if (!trimmed) return false;
    if (trimmed.charAt(0) === "#") return false;
    if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) return false;
    // Anything that looks like an external URL — skip.
    if (/^(https?:)?\/\//i.test(trimmed)) return false;
    // Extract just the filename portion (strip leading ./, query, hash).
    var pathPart = trimmed.split("?")[0].split("#")[0];
    if (!/\.html$/i.test(pathPart)) return false;
    var segments = pathPart.split("/");
    var file = segments[segments.length - 1];
    return Object.prototype.hasOwnProperty.call(OPERATOR_PAGES, file);
  }

  function decorateAnchor(anchor, slug) {
    if (!anchor || anchor.nodeType !== 1) return;
    var rawHref = anchor.getAttribute("href");
    if (!isOperatorHtmlHref(rawHref)) return;
    // Re-decorate if the slug changed or the href has been replaced.
    if (anchor.dataset.vendorNavSlug === slug && anchor.dataset.vendorNavHref === rawHref) {
      return;
    }
    try {
      var url = new URL(rawHref, window.location.href);
      if (url.origin !== window.location.origin) return;
      url.searchParams.set("vendor", slug);
      var trimmed = rawHref.trim();
      var prefix = trimmed.indexOf("./") === 0 ? "./" : "";
      var file = url.pathname.split("/").pop();
      var newHref = prefix + file + url.search + url.hash;
      anchor.setAttribute("href", newHref);
      anchor.dataset.vendorNavSlug = slug;
      anchor.dataset.vendorNavHref = newHref;
    } catch (e) {
      // Malformed href — leave alone.
    }
  }

  function decorateAll(root, slug) {
    if (!root || !root.querySelectorAll) return;
    var anchors = root.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) {
      decorateAnchor(anchors[i], slug);
    }
  }

  function start() {
    var slug = getVendorSlug();
    if (!slug) return;

    decorateAll(document, slug);

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "childList") {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (!node || node.nodeType !== 1) continue;
            if (node.tagName === "A") {
              decorateAnchor(node, slug);
            }
            if (node.querySelectorAll) {
              decorateAll(node, slug);
            }
          }
        } else if (m.type === "attributes" && m.target && m.target.tagName === "A") {
          decorateAnchor(m.target, slug);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
