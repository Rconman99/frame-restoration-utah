(function (root) {
  'use strict';

  // Use only when a legacy dashboard template must interpolate text into an
  // HTML string. Interactive access-management rows use DOM + textContent.
  // This helper closes stored-XSS paths from lead names, phone/call fields,
  // PostHog paths, and external feeds before the string reaches innerHTML.
  root.__dashboardEscapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
