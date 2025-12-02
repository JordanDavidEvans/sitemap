# Sitemap tools for Cloudflare Pages

This static page processes sitemaps and redirect sheets entirely in the browser:

- Upload a `sitemap.xml` to extract internal page slugs and download them as a CSV.
- Upload a six-column redirect CSV, search for a destination slug from the sitemap list, and export a trimmed CSV containing only **Old Page URL**, **Destination Page URL**, and **Redirect Type**.

All parsing and CSV generation happens locally in visitor JavaScript.
