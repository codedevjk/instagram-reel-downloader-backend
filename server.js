const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Function to get reel download URL using Puppeteer
async function getReelDownloadUrl(reelUrl) {
  let browser;
  try {
    console.log('Launching browser for:', reelUrl);
    
    // Launch browser with optimized settings for Render
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    
    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('Navigating to Instagram page...');
    
    // Go to the reel URL with proper settings
    await page.goto(reelUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('Page loaded, waiting for content...');
    
    // Wait for video or main content to load
    await page.waitForSelector('article, video, [role="main"]', { timeout: 15000 }).catch(() => {
      console.log('Main content selector not found, continuing...');
    });

    // Extract video URL using multiple methods
    const videoUrl = await page.evaluate(() => {
      console.log('Searching for video URL in page...');
      
      // Method 1: Check video elements directly
      const videoElements = document.querySelectorAll('video');
      console.log('Found', videoElements.length, 'video elements');
      
      for (let video of videoElements) {
        if (video.src && (video.src.includes('instagram') || video.src.includes('.mp4'))) {
          console.log('Found video URL in video element');
          return video.src;
        }
      }

      // Method 2: Check for JSON data in scripts
      const scripts = Array.from(document.querySelectorAll('script'));
      console.log('Checking', scripts.length, 'script tags');
      
      for (let script of scripts) {
        const content = script.textContent;
        if (content && content.includes('video_url')) {
          console.log('Found video_url in script content');
          const match = content.match(/"video_url"\s*:\s*"([^"]+)"/);
          if (match && match[1]) {
            return match[1].replace(/\\u0026/g, '&');
          }
        }
      }

      // Method 3: Check for GraphQL data
      for (let script of scripts) {
        const content = script.textContent;
        if (content && content.includes('graphql')) {
          try {
            const data = JSON.parse(content);
            if (data && data.graphql && data.graphql.shortcode_media && data.graphql.shortcode_media.video_url) {
              console.log('Found video URL in GraphQL data');
              return data.graphql.shortcode_media.video_url;
            }
          } catch (e) {
            // Not valid JSON, continue
          }
        }
      }

      // Method 4: Check meta tags
      const metaVideo = document.querySelector('meta[property="og:video"]');
      if (metaVideo) {
        console.log('Found video URL in meta tag');
        return metaVideo.getAttribute('content');
      }

      // Method 5: Look for any URLs that look like videos
      const allLinks = Array.from(document.querySelectorAll('a, link'));
      for (let link of allLinks) {
        const href = link.getAttribute('href') || link.getAttribute('content');
        if (href && (href.includes('.mp4') || (href.includes('video') && href.includes('instagram')))) {
          console.log('Found video-like URL in links');
          return href;
        }
      }

      console.log('No video URL found in any method');
      return null;
    });

    if (!videoUrl) {
      // Try one more approach - get all network requests for video files
      const videoRequests = await page.evaluate(() => {
        // This would normally be done with request interception, but we'll try a different approach
        // Look for video URLs in the entire page content
        const pageContent = document.body.innerText;
        const videoMatches = pageContent.match(/https?:\/\/[^\s"]+\.mp4[^\s"]*/g);
        return videoMatches ? videoMatches[0] : null;
      });

      if (videoRequests) {
        console.log('Found video URL from page content analysis');
        return videoRequests;
      }

      throw new Error('Could not extract video URL from page content');
    }

    // Clean URL
    let cleanUrl = videoUrl;
    if (cleanUrl.startsWith('\\')) {
      cleanUrl = cleanUrl.substring(1);
    }
    
    try {
      cleanUrl = decodeURIComponent(cleanUrl);
    } catch (e) {
      console.log('Could not decode URL, using as-is');
    }

    console.log('Successfully extracted video URL');
    return cleanUrl;
  } catch (error) {
    console.error('Puppeteer error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw new Error(`Failed to extract video: ${error.message}`);
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
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

    // Get download URL using Puppeteer
    const downloadUrl = await getReelDownloadUrl(url);

    if (!downloadUrl) {
      return res.status(404).json({ 
        success: false, 
        message: 'Could not find downloadable video. The post might not contain a video or Instagram has blocked access.' 
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
    version: '5.0 - Puppeteer Method'
  });
});

// Test endpoint for Puppeteer
app.get('/test-puppeteer', async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://example.com');
    const title = await page.title();
    await browser.close();
    res.json({ success: true, title });
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Instagram Reel Downloader with Puppeteer is ready!');
});

module.exports = app;