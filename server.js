const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Alternative method to get reel download URL
async function getReelDownloadUrl(reelUrl) {
  try {
    // Extract shortcode from URL
    const shortcode = reelUrl.match(/\/reel\/([A-Za-z0-9_-]+)/)?.[1];
    if (!shortcode) {
      throw new Error('Invalid Instagram reel URL');
    }

    // Try multiple GraphQL endpoints
    const endpoints = [
      `https://www.instagram.com/graphql/query/?query_hash=b3055c01b9479c0110c9a45a5e7d5c0d&variables={"shortcode":"${shortcode}"}`,
      `https://www.instagram.com/graphql/query/?query_hash=2dea4d7c0d33d33a0d0d0d0d0d0d0d0d&variables={"shortcode":"${shortcode}"}`,
      `https://www.instagram.com/p/${shortcode}?__a=1&__d=dis`
    ];

    let reelData = null;
    let videoUrl = null;

    // Try first endpoint (most reliable)
    try {
      const response = await axios.get(endpoints[0], {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      // Check different possible data paths
      if (response.data && response.data.data && response.data.data.shortcode_media) {
        reelData = response.data.data.shortcode_media;
      } else if (response.data && response.data.graphql && response.data.graphql.shortcode_media) {
        reelData = response.data.graphql.shortcode_media;
      } else if (response.data && response.data.shortcode_media) {
        reelData = response.data.shortcode_media;
      }

      if (reelData) {
        // Try different paths for video URL
        if (reelData.video_url) {
          videoUrl = reelData.video_url;
        } else if (reelData.edge_sidecar_to_children && reelData.edge_sidecar_to_children.edges.length > 0) {
          const firstItem = reelData.edge_sidecar_to_children.edges[0].node;
          if (firstItem.video_url) {
            videoUrl = firstItem.video_url;
          }
        } else if (reelData.display_url && reelData.is_video) {
          // Fallback to display URL for videos
          videoUrl = reelData.display_url;
        }
      }
    } catch (graphQLError) {
      console.log('First GraphQL endpoint failed, trying alternative method...');
    }

    // If first method failed, try scraping method
    if (!videoUrl) {
      try {
        const response = await axios.get(reelUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        // Extract video URL from page source
        const pageContent = response.data;
        
        // Look for video URL in page content
        const videoUrlMatch = pageContent.match(/video_url["']?\s*:\s*["']([^"']+)["']/) ||
                             pageContent.match(/"video_url"\s*:\s*"([^"]+)"/) ||
                             pageContent.match(/og:video["']?\s*content=["']([^"']+)["']/i);
        
        if (videoUrlMatch && videoUrlMatch[1]) {
          videoUrl = videoUrlMatch[1].replace(/\\u0026/g, '&');
        }
      } catch (scrapingError) {
        console.log('Scraping method also failed');
      }
    }

    if (!videoUrl) {
      throw new Error('Could not extract video URL. Instagram may have changed their API structure.');
    }

    return videoUrl;
  } catch (error) {
    console.error('Error fetching reel:', error.message);
    throw new Error(`Failed to fetch reel: ${error.message}`);
  }
}

// Route to handle reel download
app.post('/download', async (req, res) => {
  try {
    const { url } = req.body;

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

    console.log('Processing URL:', url);

    // Get download URL
    const downloadUrl = await getReelDownloadUrl(url);

    console.log('Download URL found:', downloadUrl ? 'Yes' : 'No');

    if (!downloadUrl) {
      return res.status(404).json({ 
        success: false, 
        message: 'Could not find downloadable video. The post might not be a video or Instagram changed their structure.' 
      });
    }

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
    version: '2.0'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;