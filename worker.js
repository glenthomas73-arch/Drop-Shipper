addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  if (!targetUrl) {
    return new Response('Missing ?url= parameter', {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://syncee.com/',
        'Accept': 'text/html,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return new Response('Failed to fetch image: ' + response.status, {
        status: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // If HTML page - extract Syncee product images and return as JSON
    if (contentType.includes('text/html')) {
      const html = await response.text();

      // Extract og:image (always present, reliable)
      const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
      const ogImage = ogMatch ? ogMatch[1] : null;

      // Extract all image.syncee.com and cdn.shopify.com image URLs from img tags
      const imgRegex = /https:\/\/(?:image\.syncee\.com\/v1\/image\?url=([^"&\s]+)|cdn\.shopify\.com\/s\/files\/[^"'\s]+\.(?:jpg|jpeg|png|webp))/gi;
      const found = new Set();
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        let imgUrl = match[0];
        // If it's a syncee image CDN URL, decode the inner URL
        if (imgUrl.includes('image.syncee.com')) {
          const inner = match[1];
          if (inner) {
            try {
              imgUrl = decodeURIComponent(inner).split('&')[0];
            } catch(e) {}
          }
        }
        // Skip logos, icons, badges, social icons
        if (!imgUrl.match(/logo|icon|badge|social|footer|trustpilot|google|paypal|stripe|visa|mastercard|maestro|amex|discover|jcb|diners|facebook|instagram|youtube|tiktok|linkedin|twitter|shopify-app/i)) {
          found.add(imgUrl);
        }
      }

      // Add og:image if present and not already found
      if (ogImage && !found.has(ogImage)) {
        found.add(ogImage);
      }

      const images = Array.from(found).slice(0, 6); // max 6 images

      return new Response(JSON.stringify({ images }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Otherwise proxy as image
    const imageData = await response.arrayBuffer();
    return new Response(imageData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });

  } catch (err) {
    return new Response('Proxy error: ' + err.message, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}
