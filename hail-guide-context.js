/* Explicit guide context, not inferred property location or acquisition source. */
(function () {
  'use strict';
  var guides = { midway: 'Midway', hideout: 'Hideout', charleston: 'Charleston' };
  var params = new URLSearchParams(window.location.search);
  var key = params.get('roof_guide');
  if (params.getAll('roof_guide').length !== 1 || !Object.prototype.hasOwnProperty.call(guides, key)) return;
  window.FrameHailGuideContext = {
    apply: function (payload) {
      // This is the actual submit-page path with its allowlisted guide query.
      // Never copy arbitrary URL parameters, modify first-touch acquisition,
      // or pollute message/issue: those fields drive urgent-lead classification.
      payload.source_page = window.location.pathname + '?roof_guide=' + key;
    }
  };
  document.querySelectorAll('#heroForm, #leadForm').forEach(function (form) {
    var notice = document.createElement('p');
    notice.className = 'hail-guide-context';
    notice.textContent = 'You came from our ' + guides[key] + ' hail guide. Include the property’s actual town and tell us if water is entering. We will include which guide you used with your request.';
    form.insertBefore(notice, form.querySelector('.form-row, .form-group'));
  });
}());
