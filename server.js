const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Function to get reel download URL using multiple fallback methods
async function getReelDownloadUrl(reelUrl) {
  // Try multiple methods in order of reliability
  const methods = [
    tryScrapingMethod,
    tryGraphQLMethod,
    tryDirectApiMethod
  ];

  for (const method of methods) {
    try {
      console.log(`Trying method: ${method.name}`);
      const result = await method(reelUrl);
      if (result) {
        console.log(`Success with method: ${method.name}`);
        return result;
      }
    } catch (error) {
      console.log(`Method ${method.name} failed:`, error.message);
    }
  }

  throw new Error('All extraction methods failed. Instagram may have changed their structure.');
}

// Method 1: Web scraping approach
async function tryScrapingMethod(reelUrl) {
  try {
    // Dynamically import node-fetch
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(reelUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Try multiple regex patterns to find video URL
    const patterns = [
      /"video_url"\s*:\s*"([^"]+)"/,
      /video_url["']?\s*:\s*["']([^"']+)["']/,
      /"og:video"\s*content\s*=\s*"([^"]+)"/i,
      /property\s*=\s*["']og:video["']\s*content\s*=\s*["']([^"']+)["']/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let videoUrl = match[1];
        // Clean URL
        if (videoUrl.startsWith('\\')) {
          videoUrl = videoUrl.substring(1);
        }
        try {
          videoUrl = decodeURIComponent(videoUrl);
        } catch (e) {
          // Ignore decode errors
        }
        // Validate URL format
        if (videoUrl.includes('.mp4') || videoUrl.includes('instagram')) {
          return videoUrl;
        }
      }
    }

    // Try to find video URL in script tags with JSON data
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        try {
          const jsonData = script.match(/>[^<]*({"video_url"[^}]+"})[^<]*</);
          if (jsonData && jsonData[1]) {
            const parsed = JSON.parse(jsonData[1]);
            if (parsed.video_url) {
              return parsed.video_url;
            }
          }
        } catch (e) {
          // Continue to next script tag
        }
      }
    }

    return null;
  } catch (error) {
    console.log('Scraping method failed:', error.message);
    return null;
  }
}

// Method 2: GraphQL API approach
async function tryGraphQLMethod(reelUrl) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    // Extract shortcode from URL
    const shortcode = reelUrl.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/)?.[1];
    if (!shortcode) return null;

    const graphqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b9479c0110c9a45a5e7d5c0d&variables={"shortcode":"${shortcode}"}`;
    
    const response = await fetch(graphqlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Navigate through possible data structures
    const paths = [
      ['data', 'shortcode_media', 'video_url'],
      ['graphql', 'shortcode_media', 'video_url'],
      ['shortcode_media', 'video_url']
    ];

    for (const path of paths) {
      let current = data;
      let valid = true;
      
      for (const key of path) {
        if (current && current[key] !== undefined) {
          current = current[key];
        } else {
          valid = false;
          break;
        }
      }
      
      if (valid && current) {
        return current;
      }
    }

    return null;
  } catch (error) {
    console.log('GraphQL method failed:', error.message);
    return null;
  }
}

// Method 3: Direct API approach
async function tryDirectApiMethod(reelUrl) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    // Extract shortcode
    const shortcode = reelUrl.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/)?.[1];
    if (!shortcode) return null;

    const apiUrl = `https://www.instagram.com/p/${shortcode}?__a=1&__d=dis`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'X-IG-App-ID': '936619743392459'
      }
    });

    if (!response.ok) {
      throw new Error(`Direct API request failed: ${response.status}`);
    }

    const text = await response.text();
    
    // Try to parse as JSON
    try {
      const data = JSON.parse(text);
      
      // Recursive function to find video_url in nested object
      const findVideoUrl = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        
        if (obj.video_url && typeof obj.video_url === 'string') {
          return obj.video_url;
        }
        
        for (const key in obj) {
          const result = findVideoUrl(obj[key]);
          if (result) return result;
        }
        return null;
      };

      return findVideoUrl(data);
    } catch (parseError) {
      // If not JSON, try regex on text
      const match = text.match(/"video_url"\s*:\s*"([^"]+)"/);
      if (match && match[1]) {
        return match[1].replace(/\\u0026/g, '&');
      }
    }

    return null;
  } catch (error) {
    console.log('Direct API method failed:', error.message);
    return null;
  }
}

// Route to handle reel download
app.post('/download', async (req, res) => {
  try {
    const { url } = req.body;

    console.log('Received download request for:', url);

    if (!url) {
      return res.status(400).json({ 
        success: false, 
        message: 'URL is required' 
      });
    }

    // Validate Instagram URL
    if (!url.includes('instagram.com/reel/') && !url.includes('instagram.com/p/')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Instagram URL. Please use a reel or post URL.' 
      });
    }

    // Get download URL using multiple methods
    const downloadUrl = await getReelDownloadUrl(url);

    if (!downloadUrl) {
      return res.status(404).json({ 
        success: false, 
        message: 'Could not find downloadable video. The post might not contain a video or Instagram has updated their structure.' 
      });
    }

    console.log('Successfully extracted download URL');
    return res.json({ 
      success: true, 
      downloadUrl 
    });

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch reel. Please try again with a different reel.' 
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Instagram Reel Downloader API is running!',
    timestamp: new Date().toISOString(),
    version: '7.0 - Multi-Method Approach'
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Multi-method Instagram Reel Downloader is working!',
    methods: [
      'tryScrapingMethod',
      'tryGraphQLMethod', 
      'tryDirectApiMethod'
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Instagram Reel Downloader with multi-method approach is ready!');
});

module.exports = app;