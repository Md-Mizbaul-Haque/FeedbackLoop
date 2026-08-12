(function () {
  "use strict";

  var script = document.currentScript;
  var base = script && script.src ? script.src.replace(/\/widget\.js.*$/, "") : window.location.origin;

  var styles = [
    ".flw-widget{max-width:280px;margin:0;padding:16px;border:1px solid #e9e6f5;border-radius:12px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-sizing:border-box}",
    ".flw-widget *,.flw-widget *:before,.flw-widget *:after{box-sizing:border-box;margin:0;padding:0}",
    ".flw-widget .flw-header{font-size:12px;font-weight:700;color:#1a1721;margin-bottom:8px}",
    ".flw-widget .flw-subtitle{font-size:11px;line-height:1.4;color:#7a7585;margin-bottom:10px}",
    ".flw-widget .flw-list{list-style:none;display:flex;flex-direction:column;gap:8px}",
    ".flw-widget .flw-item{display:flex;align-items:center;gap:8px;font-size:12px;color:#4b4757;font-weight:500}",
    ".flw-widget .flw-dot{width:6px;height:6px;border-radius:9999px;background:#7c5cf0;flex-shrink:0}",
    ".flw-widget .flw-footer{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid #f0edfa;font-size:10px;color:#7a7585}",
    ".flw-widget .flw-shield{width:14px;height:14px;border-radius:9999px;background:#7c5cf0;color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:700}",
    ".flw-widget.flw-dark{border-color:#262b3f;background:#12161f}",
    ".flw-widget.flw-dark .flw-header{color:#fff}",
    ".flw-widget.flw-dark .flw-subtitle{color:#8b93a7}",
    ".flw-widget.flw-dark .flw-item{color:#cbd2e0}",
    ".flw-widget.flw-dark .flw-dot{background:#8b6df2}",
    ".flw-widget.flw-dark .flw-footer{border-top-color:#262b3f;color:#8b93a7}",
  ].join("");

  var styleEl = document.createElement("style");
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  function fetchSummary(widgetId) {
    return fetch(base + "/api/widget?widget_id=" + encodeURIComponent(widgetId), {
      method: "GET",
      headers: { "Accept": "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Widget request failed (" + res.status + ")");
        return res.json();
      });
  }

  function widgetContent(summary) {
    var analysis = summary.analysis || {};
    var sentiment = analysis.sentiment || {};

    var themes = (Array.isArray(analysis.themes) ? analysis.themes : [])
      .slice()
      .sort(function (a, b) { return (b.mentions || 0) - (a.mentions || 0); })
      .slice(0, 3);
    var items = themes.length
      ? themes.map(function (theme) { return theme.name; })
      : (Array.isArray(summary.keywords) ? summary.keywords : [])
          .map(function (k) { return k.label; })
          .slice(0, 3);

    var positive = sentiment.positive_pct != null ? sentiment.positive_pct : (summary.positive_sentiment_pct || 0);
    var neutral = sentiment.neutral_pct != null ? sentiment.neutral_pct : 0;
    var negative = sentiment.negative_pct != null ? sentiment.negative_pct : Math.max(0, 100 - positive);

    var dominant;
    if (positive >= Math.max(neutral, negative) + 15 && positive >= 40) {
      dominant = "positive";
    } else if (negative >= Math.max(neutral, positive) + 15 && negative >= 40) {
      dominant = "negative";
    } else if (neutral >= positive + 15 && neutral >= negative + 15 && neutral >= 50) {
      dominant = "neutral";
    } else {
      dominant = "mixed";
    }

    if (dominant === "positive") {
      return { header: "What customers love", subtitle: null, items: items };
    }
    if (dominant === "negative") {
      return {
        header: "Customer Feedback",
        subtitle: "Customers are currently highlighting areas for improvement.",
        items: items,
      };
    }
    if (dominant === "neutral") {
      return { header: "Customer feedback", subtitle: null, items: items };
    }
    return { header: "What customers say", subtitle: null, items: items };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function render(container, summary) {
    var dark = container.getAttribute("data-theme") === "dark";
    var content = widgetContent(summary);
    if (!content.items.length) return;

    var card = el("div", "flw-widget" + (dark ? " flw-dark" : ""));
    card.setAttribute("role", "complementary");
    card.setAttribute("aria-label", content.header);

    card.appendChild(el("p", "flw-header", content.header));
    if (content.subtitle) {
      card.appendChild(el("p", "flw-subtitle", content.subtitle));
    }

    var list = el("ul", "flw-list");
    content.items.forEach(function (label) {
      var item = el("li", "flw-item");
      item.appendChild(el("span", "flw-dot"));
      item.appendChild(el("span", null, label));
      list.appendChild(item);
    });
    card.appendChild(list);

    var footer = el("div", "flw-footer");
    footer.appendChild(el("span", "flw-shield", "\u2713"));
    footer.appendChild(el("span", null, "Verified by FeedbackLoop"));
    card.appendChild(footer);

    container.appendChild(card);
  }

  function init() {
    var containers = document.querySelectorAll("#feedbackloop-widget[data-id]");
    containers.forEach(function (container) {
      fetchSummary(container.getAttribute("data-id"))
        .then(function (summary) { render(container, summary); })
        .catch(function () {});
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();