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

// Instagram Reel Download Function
async function getReelDownloadUrl(reelUrl) {
  try {
    // Extract shortcode from URL
    const shortcode = reelUrl.match(/\/reel\/([A-Za-z0-9_-]+)/)?.[1];
    if (!shortcode) {
      throw new Error('Invalid Instagram reel URL');
    }

    // Construct GraphQL URL
    const graphqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b9479c0110c9a45a5e7d5c0d&variables={"shortcode":"${shortcode}"}`;
    
    // Make request to Instagram
    const response = await axios.get(graphqlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    const reelData = response.data.data.shortcode_media;
    
    if (!reelData) {
      throw new Error('Reel not found');
    }

    // Get video URL
    let videoUrl = null;
    if (reelData.video_url) {
      videoUrl = reelData.video_url;
    } else if (reelData.edge_sidecar_to_children && reelData.edge_sidecar_to_children.edges.length > 0) {
      const firstItem = reelData.edge_sidecar_to_children.edges[0].node;
      if (firstItem.video_url) {
        videoUrl = firstItem.video_url;
      }
    }

    if (!videoUrl) {
      throw new Error('Video URL not found');
    }

    return videoUrl;
  } catch (error) {
    console.error('Error fetching reel:', error.message);
    throw error;
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
    if (!url.includes('instagram.com/reel/')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Instagram reel URL' 
      });
    }

    // Get download URL
    const downloadUrl = await getReelDownloadUrl(url);

    return res.json({ 
      success: true, 
      downloadUrl 
    });

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch reel. Please try again.' 
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Instagram Reel Downloader API is running!',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;