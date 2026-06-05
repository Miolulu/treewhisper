const { marked } = require("marked");
const sanitizeHtml = require("sanitize-html");

function renderContent(content, contentType) {
  if (contentType === "markdown") {
    const html = marked.parse(content || "");
    return sanitizeHtml(html, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3"]),
      allowedAttributes: {
        a: ["href", "name", "target"],
        img: ["src", "alt"]
      }
    });
  }
  return sanitizeHtml((content || "").replace(/\n/g, "<br>"));
}

module.exports = {
  renderContent
};
