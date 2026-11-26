/*
 * Roof size calculator (Frame Restoration).
 *
 * Roof size comes from geometry only: ground footprint x eaves allowance x pitch factor.
 * This calculator never prints a dollar figure. Prices were removed by owner decision
 * on 2026-11-25: Frame prices every roof from a free inspection and a written scope,
 * so there is no price path here to fill in.
 */
(function () {
  "use strict";

  var ROOF_CALC = {
    "market": "UT",
    "materials": [
      { "id": "architectural", "label": "Architectural shingles" },
      { "id": "class4", "label": "Class 4 impact-resistant shingles" },
      { "id": "metal", "label": "Standing-seam metal" }
    ],
    "sizeNote": "Frame Restoration Utah prices every roof from a free inspection and a written scope, because pitch, tear-off layers, decking and ventilation change the work. Use the roof size above when you compare bids.",
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

  function fillMaterials(select) {
    ROOF_CALC.materials.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      select.appendChild(o);
    });
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
      out.innerHTML = '<p class="rc-note">Enter a ground footprint (or roof squares) to see your roof size.</p>';
      return;
    }
    squares = Math.round(squares * 10) / 10;
    var m = ROOF_CALC.materials.filter(function (x) { return x.id === $("rc-material").value; })[0];
    var size = "<p><strong>Estimated roof size:</strong> about " + squares + " squares (" +
      Math.round(squares * 100).toLocaleString("en-US") + " sq ft of roof surface).</p>";
    out.innerHTML = size + '<p class="rc-note">' + ROOF_CALC.sizeNote + "</p>" +
      '<p><a href="' + ROOF_CALC.ctaHref + '" class="btn-primary" ' + (ROOF_CALC.ctaAttr || "data-inspection-modal") + '>Get my written quote</a> ' +
      '<a href="tel:' + ROOF_CALC.phoneTel + '" class="btn-secondary">Call ' + ROOF_CALC.phoneDisplay + "</a></p>";
    if (window.posthog) {
      window.posthog.capture("roof_size_estimate", {
        page: window.location.pathname, squares: squares, material: m ? m.id : ""
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
    module.exports = { ROOF_CALC: ROOF_CALC, PITCH: PITCH, OVERHANG: OVERHANG };
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
