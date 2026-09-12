import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listingDiagnostics } from '../../src/registries/uspto/bulk-xml-adapter.js';

describe('USPTO bulk listing diagnostics', () => {
  it('reports bounded public-page structure without query values or arbitrary body text', () => {
    const html = `
      <html><head><title> Trademark XML Downloads </title></head><body>
        <form action="/download.php?token=secret-value"><select><option value="/files.php?key=hidden">Daily files</option></select></form>
        <a href="/help?session=private">Help</a>
        <script>window.loader = 'xml download';</script>
        <p>do-not-copy-this-body-value</p>
      </body></html>
    `;
    const response = { headers: { get: (name) => name === 'content-type' ? 'text/html; charset=UTF-8' : null } };
    const result = listingDiagnostics(html, 'https://trademarks.example.test/tmappxml.php', response);

    assert.equal(result.contentType, 'text/html; charset=UTF-8');
    assert.equal(result.title, 'Trademark XML Downloads');
    assert.equal(result.forms, 1);
    assert.equal(result.selects, 1);
    assert.equal(result.options, 1);
    assert.equal(result.anchors, 1);
    assert.equal(result.scripts, 1);
    assert.equal(result.hasZipToken, false);
    assert.equal(result.hasXmlToken, true);
    assert.equal(result.hasDownloadToken, true);
    assert.deepEqual(result.sameOriginPaths, ['/download.php', '/files.php', '/help']);
    assert.equal(JSON.stringify(result).includes('secret-value'), false);
    assert.equal(JSON.stringify(result).includes('do-not-copy-this-body-value'), false);
  });
});
