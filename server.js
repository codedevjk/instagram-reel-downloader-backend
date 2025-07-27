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

// Replace the getReelDownloadUrl function with this improved version:
async function getReelDownloadUrl(reelUrl) {
    try {
      console.log('Using your RapidAPI for:', reelUrl);
      
      // Dynamically import node-fetch
      const fetch = (await import('node-fetch')).default;
  
      // Use your specific RapidAPI endpoint
      const apiUrl = `https://instagram-reels-downloader-api.p.rapidapi.com/download?url=${encodeURIComponent(reelUrl)}`;
      
      console.log('Calling your RapidAPI endpoint:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': '5c4257cfa5msh402d7a665519259p1c24fajsn6f54b84f399b',
          'x-rapidapi-host': 'instagram-reels-downloader-api.p.rapidapi.com'
        }
      });
  
      console.log('RapidAPI response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('RapidAPI error response:', errorText);
        throw new Error(`RapidAPI request failed: ${response.status} ${response.statusText}`);
      }
  
      const data = await response.json();
      console.log('RapidAPI successful response:', JSON.stringify(data, null, 2));
  
      // Check if response indicates success and no error
      if (!data.success || (data.data && data.data.error)) {
        throw new Error('RapidAPI returned an error: ' + (data.data.message || 'Unknown error'));
      }
  
      // Extract video URL from the response structure shown in your logs
      if (data.data && data.data.medias && Array.isArray(data.data.medias)) {
        // Look for video media first
        const videoMedia = data.data.medias.find(media => 
          media.type === 'video' && media.url
        );
        
        if (videoMedia) {
          console.log('Found video URL:', videoMedia.url);
          return videoMedia.url;
        }
        
        // If no specific video found, try first media with URL
        const firstMedia = data.data.medias.find(media => media.url);
        if (firstMedia) {
          console.log('Found first media URL:', firstMedia.url);
          return firstMedia.url;
        }
      }
  
      // Fallback: check other possible paths
      const possiblePaths = [
        data.data?.url,
        data.url,
        data.downloadUrl,
        data.videoUrl
      ];
  
      for (const url of possiblePaths) {
        if (url && typeof url === 'string' && url.includes('http')) {
          console.log('Found URL in fallback path:', url);
          return url;
        }
      }
  
      throw new Error('No downloadable video found in RapidAPI response. Response structure may have changed.');
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

    // Get download URL using RapidAPI
    const downloadUrl = await getReelDownloadUrl(url);

    if (!downloadUrl) {
      return res.status(404).json({ 
        success: false, 
        message: 'Could not find downloadable video using RapidAPI.' 
      });
    }

    console.log('Successfully extracted download URL via RapidAPI:', downloadUrl);
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
    version: '10.1 - Your RapidAPI Implementation'
  });
});

// Test endpoint to verify RapidAPI key works
app.get('/test-rapidapi', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const testUrl = 'https://www.instagram.com/reel/Cexample123/';
    const apiUrl = `https://instagram-reels-downloader-api.p.rapidapi.com/download?url=${encodeURIComponent(testUrl)}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': '5c4257cfa5msh402d7a665519259p1c24fajsn6f54b84f399b',
        'x-rapidapi-host': 'instagram-reels-downloader-api.p.rapidapi.com'
      }
    });
    
    res.json({ 
      success: response.ok,
      status: response.status,
      message: response.ok ? 'RapidAPI key is working' : 'RapidAPI key failed'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Instagram Reel Downloader with your RapidAPI is ready!');
});

module.exports = app;