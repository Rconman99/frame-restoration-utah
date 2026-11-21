/*
 * Roof cost calculator (Frame Restoration).
 *
 * Roof size comes from geometry only: ground footprint x eaves allowance x pitch factor.
 * Dollar ranges come ONLY from ROOF_PRICING below. A material whose low or high is null
 * shows the roof size and an inspection prompt, never a made-up number.
 *
 * ROOF_PRICING values must be owner-confirmed before they are filled in. Record who
 * confirmed them and when in `confirmedBy` and `confirmedOn`.
 */
(function () {
  "use strict";

  var ROOF_PRICING = {
    "market": "UT",
    "confirmedBy": null,
    "confirmedOn": null,
    "materials": [
      {
        "id": "architectural",
        "label": "Architectural shingles",
        "lowPerSquare": null,
        "highPerSquare": null
      },
      {
        "id": "class4",
        "label": "Class 4 impact-resistant shingles",
        "lowPerSquare": null,
        "highPerSquare": null
      },
      {
        "id": "metal",
        "label": "Standing-seam metal",
        "lowPerSquare": null,
        "highPerSquare": null
      }
    ],
    "rangeNote": "A planning range for a full tear-off and replacement, not a quote. Pitch, tear-off layers, decking, ventilation, access and elevation move the final number. Your written price comes after a free inspection.",
    "unpricedNote": "Frame Restoration Utah prices every roof from a free inspection and a written scope, because pitch, tear-off layers, decking and ventilation change the number. Use the roof size above when you compare bids.",
    "ctaHref": "/#contact",
    "ctaAttr": "data-booking-trigger",
    "phoneTel": "+14352928802",
    "phoneDisplay": "435-292-8802"
  };

  // Pitch factor = sqrt(1 + (rise/12)^2): converts flat footprint to sloped roof area.
  var PITCH = {
    low: { label: "Low slope (about 4/12)", factor: 1.054 },
    standard: { label: "Standard (about 6/12)", factor: 1.118 },
    steep: { label: "Steep (about 8/12)", factor: 1.202 },
    very_steep: { label: "Very steep (10/12 or more)", factor: 1.302 }
  };
  // Eaves and rake overhang allowance on top of the ground footprint.
  var OVERHANG = 1.1;

  function $(id) { return document.getElementById(id); }
  function round500(n) { return Math.round(n / 500) * 500; }
  function money(n) { return "$" + round500(n).toLocaleString("en-US"); }

  function fillMaterials(select) {
    ROOF_PRICING.materials.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      select.appendChild(o);
    });
  }

  function priced(m) {
    return m && typeof m.lowPerSquare === "number" && typeof m.highPerSquare === "number";
  }

  function estimate() {
    var mode = document.querySelector('input[name="rc-mode"]:checked');
    var out = $("rc-result");
    var squares;
    if (mode && mode.value === "squares") {
      squares = parseFloat($("rc-squares").value);
    } else {
      var footprint = parseFloat($("rc-footprint").value);
      var pitch = PITCH[$("rc-pitch").value] || PITCH.standard;
      squares = footprint > 0 ? (footprint * OVERHANG * pitch.factor) / 100 : NaN;
    }
    if (!(squares > 0) || squares > 400) {
      out.innerHTML = '<p class="rc-note">Enter a ground footprint (or roof squares) to see an estimate.</p>';
      return;
    }
    squares = Math.round(squares * 10) / 10;
    var m = ROOF_PRICING.materials.filter(function (x) { return x.id === $("rc-material").value; })[0];
    var size = "<p><strong>Estimated roof size:</strong> about " + squares + " squares (" +
      Math.round(squares * 100).toLocaleString("en-US") + " sq ft of roof surface).</p>";
    var price;
    if (priced(m)) {
      price = '<p class="rc-range"><strong>Planning range for ' + m.label.toLowerCase() + ":</strong> " +
        money(squares * m.lowPerSquare) + " to " + money(squares * m.highPerSquare) + "</p>" +
        '<p class="rc-note">' + ROOF_PRICING.rangeNote + "</p>";
    } else {
      price = '<p class="rc-note">' + ROOF_PRICING.unpricedNote + "</p>";
    }
    out.innerHTML = size + price +
      '<p><a href="' + ROOF_PRICING.ctaHref + '" class="btn-primary" ' + (ROOF_PRICING.ctaAttr || "data-inspection-modal") + '>Get my written quote</a> ' +
      '<a href="tel:' + ROOF_PRICING.phoneTel + '" class="btn-secondary">Call ' + ROOF_PRICING.phoneDisplay + "</a></p>";
    if (window.posthog) {
      window.posthog.capture("roof_cost_estimate", {
        page: window.location.pathname, squares: squares, material: m ? m.id : "", priced: priced(m)
      });
    }
  }

  function init() {
    var form = $("rc-form");
    if (!form) return;
    fillMaterials($("rc-material"));
    form.addEventListener("submit", function (e) { e.preventDefault(); estimate(); });
    form.addEventListener("change", function () {
      var sq = document.querySelector('input[name="rc-mode"]:checked').value === "squares";
      $("rc-footprint-row").hidden = sq;
      $("rc-pitch-row").hidden = sq;
      $("rc-squares-row").hidden = !sq;
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ROOF_PRICING: ROOF_PRICING, PITCH: PITCH, OVERHANG: OVERHANG, priced: priced };
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
