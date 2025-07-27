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

// Function to get reel download URL using RapidAPI
async function getReelDownloadUrl(reelUrl) {
  try {
    console.log('Using RapidAPI for:', reelUrl);
    
    // Dynamically import node-fetch
    const fetch = (await import('node-fetch')).default;
    
    // RapidAPI Instagram Downloader endpoint
    const response = await fetch(`https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index?url=${encodeURIComponent(reelUrl)}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY, // Set in Render environment variables
        'X-RapidAPI-Host': 'instagram-downloader-download-instagram-videos-stories.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      throw new Error(`RapidAPI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('RapidAPI response:', JSON.stringify(data, null, 2));

    // Check if we got media data
    if (data && data.media && Array.isArray(data.media)) {
      // Look for video media
      const videoMedia = data.media.find(media => 
        media.type === 'video' && media.url
      );
      
      if (videoMedia) {
        return videoMedia.url;
      }
      
      // If no specific video found, try first media with URL
      const firstMedia = data.media.find(media => media.url);
      if (firstMedia) {
        return firstMedia.url;
      }
    }

    // Alternative response structure
    if (data && data.url) {
      return data.url;
    }

    // Try to find any video URL in the response
    const findVideoUrl = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      
      if (obj.url && (obj.type === 'video' || (obj.url.includes('.mp4') || obj.url.includes('video')))) {
        return obj.url;
      }
      
      for (const key in obj) {
        const result = findVideoUrl(obj[key]);
        if (result) return result;
      }
      return null;
    };

    const videoUrl = findVideoUrl(data);
    if (videoUrl) return videoUrl;

    throw new Error('No downloadable video found in RapidAPI response');
  } catch (error) {
    console.error('RapidAPI error:', error.message);
    throw new Error(`RapidAPI failed: ${error.message}`);
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

    // Check if RAPIDAPI_KEY is configured
    if (!process.env.RAPIDAPI_KEY) {
      return res.status(500).json({ 
        success: false, 
        message: 'Server not properly configured. Missing RapidAPI key.' 
      });
    }

    // Get download URL using RapidAPI
    const downloadUrl = await getReelDownloadUrl(url);

    if (!downloadUrl) {
      return res.status(404).json({ 
        success: false, 
        message: 'Could not find downloadable video using RapidAPI.' 
      });
    }

    console.log('Successfully extracted download URL via RapidAPI');
    return res.json({ 
      success: true, 
      downloadUrl 
    });

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch reel via RapidAPI. Please try again.' 
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Instagram Reel Downloader API is running!',
    timestamp: new Date().toISOString(),
    version: '9.0 - RapidAPI Method',
    rapidapi_configured: !!process.env.RAPIDAPI_KEY
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'RapidAPI Instagram Reel Downloader is working!',
    rapidapi_configured: !!process.env.RAPIDAPI_KEY
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Instagram Reel Downloader with RapidAPI is ready!');
  if (!process.env.RAPIDAPI_KEY) {
    console.log('WARNING: RAPIDAPI_KEY not set in environment variables!');
  }
});

module.exports = app;