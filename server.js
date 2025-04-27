require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Determine if running in production (Vercel) or development
const isProduction = process.env.NODE_ENV === 'production';

// Path for storing tokens
const TOKEN_PATH = path.join(__dirname, 'hubspot-tokens.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store tokens globally (in a real app, use a database)
let hubspotTokens = null;

// Load tokens from file if available (only works in development)
try {
  if (!isProduction && fs.existsSync(TOKEN_PATH)) {
    const tokenData = fs.readFileSync(TOKEN_PATH, 'utf8');
    hubspotTokens = JSON.parse(tokenData);
    console.log('Loaded tokens from file');
  } else {
    console.log('No saved tokens found or running in production');
  }
} catch (error) {
  console.error('Error loading tokens from file:', error.message);
}

// Function to save tokens to file
function saveTokens(tokens) {
  try {
    // In prod (serverless), dont save tokens to file
    if (isProduction) {
      console.log('Running in production, skipping token file save');
      return;
    }
    
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Tokens saved to file');
  } catch (error) {
    console.error('Error saving tokens to file:', error.message);
  }
}

// Token refresh helper function
async function refreshToken() {
  if (!hubspotTokens || !hubspotTokens.refresh_token) {
    console.log('No refresh token available');
    return false;
  }

  try {
    const refreshToken = hubspotTokens.refresh_token;
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

    const response = await axios.post('https://api.hubapi.com/oauth/v1/token', {
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    });

    if (response.data && response.data.access_token) {
      // Update the tokens
      hubspotTokens = {
        ...hubspotTokens,
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        expiry_date: Date.now() + (response.data.expires_in * 1000)
      };

      // Save the updated tokens
      saveTokens(hubspotTokens);
      console.log('Token refreshed successfully');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error refreshing token:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    return false;
  }
}

// Routes
app.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HubSpot Integration</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
      }
      h1 {
        color: #ff7a59; /* HubSpot orange */
        border-bottom: 2px solid #eee;
        padding-bottom: 10px;
      }
      .btn {
        display: inline-block;
        background-color: #ff7a59;
        color: white;
        padding: 10px 20px;
        margin: 5px;
        text-decoration: none;
        border-radius: 4px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      .btn:hover {
        background-color: #e06342;
      }
      .btn-secondary {
        background-color: #cbd6e2;
        color: #516f90;
      }
      .btn-secondary:hover {
        background-color: #b1c2d3;
      }
      .card {
        background-color: #f9f9f9;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      }
      .status-indicator {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 8px;
      }
      .status-authenticated {
        background-color: #00bda5; /* Green */
      }
      .status-unauthenticated {
        background-color: #f5c26b; /* Yellow/Orange */
      }
      code {
        background-color: #f1f1f1;
        padding: 2px 4px;
        border-radius: 3px;
        font-family: monospace;
      }
    </style>
  </head>
  <body>
    <h1>HubSpot CRM Integration</h1>
    <div class="card">
      <h2>Authentication</h2>
      <p>Connect your HubSpot account to access your CRM data. The following scopes will be requested:</p>
      <ul>
        <li><code>crm.lists.read</code> - Read access to contact lists</li>
        <li><code>crm.schemas.contacts.read</code> - Read access to contact schemas</li>
        <li><code>oauth</code> - Base authentication scope</li>
      </ul>
      <p>
        <a href="/auth/hubspot" class="btn">Connect HubSpot</a>
        <a href="/auth/hubspot?force=true" class="btn">Force New Connection</a>
        <a href="/auth/logout" class="btn btn-secondary">Logout</a>
      </p>
    </div>
    
    <div class="card">
      <h2>Data & Endpoints</h2>
      <p>Once authenticated, you can access the following data endpoints:</p>
      <p>
        <a href="/api/hubspot/contacts" class="btn btn-secondary">View Contacts</a>
        <a href="/api/hubspot/lists" class="btn btn-secondary">View Lists</a>
      </p>
    </div>
    
    <div class="card">
      <h2>Debug & Status</h2>
      <p>Use these endpoints to check connection status and debug any issues:</p>
      <p>
        <a href="/api/hubspot/check-token" class="btn btn-secondary">Check Token Status</a>
        <a href="/api/hubspot/debug" class="btn btn-secondary">Simple Debug</a>
        <a href="/api/hubspot/detailed-debug" class="btn btn-secondary">Detailed Debug</a>
      </p>
    </div>
    
    <footer style="margin-top: 40px; color: #777; font-size: 0.9em; text-align: center;">
      <p>Backend Integration Demo | Running at localhost:${PORT}</p>
    </footer>
  </body>
  </html>
  `;
  
  res.send(html);
});

// HubSpot OAuth routes
app.get('/auth/hubspot', (req, res) => {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  // Use port 5000 for redirect URI
  const redirectUri = encodeURIComponent('http://localhost:5000/oauth/callback');
  
  // Updated scopes to match what's configured in HubSpot developer portal
  const scope = encodeURIComponent('crm.lists.read crm.objects.contacts.read crm.objects.custom.read crm.schemas.contacts.read crm.schemas.custom.read oauth');
  
  // Add force parameter to bypass previously granted permissions
  const forceReauth = req.query.force === 'true';
  
  // If the force parameter is true, delete any existing tokens to ensure fresh auth
  if (forceReauth && hubspotTokens) {
    console.log('Force reauthorization requested, clearing tokens');
    hubspotTokens = null;
    
    // Remove tokens file(in dev)
    try {
      if (!isProduction && fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
        console.log('Tokens file deleted');
      }
    } catch (error) {
      console.error('Error deleting tokens file:', error.message);
    }
  }
  
  const authUrl = `https://app-na2.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  
  console.log(`Redirecting to HubSpot authorization page: ${authUrl}`);
  res.redirect(authUrl);
});

// HubSpot OAuth callback
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    console.error('No code provided in callback');
    return res.status(400).send('Authentication failed: No authorization code provided');
  }
  
  try {
    console.log('Exchanging authorization code for tokens...');
    
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = 'http://localhost:5000/oauth/callback';
    
    // Exchange code for tokens
    const response = await axios.post('https://api.hubapi.com/oauth/v1/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code
      }
    });
    
    console.log('Token exchange successful:', {
      tokenType: response.data.token_type,
      expiresIn: response.data.expires_in,
      hasAccessToken: !!response.data.access_token,
      hasRefreshToken: !!response.data.refresh_token
    });
    
    // Store tokens
    hubspotTokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expiry_date: Date.now() + (response.data.expires_in * 1000)
    };
    
    // Save tokens to file
    saveTokens(hubspotTokens);
    
    // Redirect to contacts view after authentication
    res.redirect('/api/hubspot/contacts');
  } catch (error) {
    console.error('Error during OAuth callback:', error.message);
    
    if (error.response) {
      console.error('OAuth error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// logout endpoint
app.get('/auth/logout', (req, res) => {
  hubspotTokens = null;
  
  // Remove tokens file(in dev)
  try {
    if (!isProduction && fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
      console.log('Tokens file deleted');
    }
  } catch (error) {
    console.error('Error deleting tokens file:', error.message);
  }
  
  res.json({
    status: 'success',
    message: 'Logged out successfully',
    authUrl: '/auth/hubspot'
  });
});

// Check token status endpoint
app.get('/api/hubspot/check-token', (req, res) => {
  const hasToken = !!hubspotTokens;
  const isExpired = hasToken && hubspotTokens.expiry_date ? Date.now() >= hubspotTokens.expiry_date : true;
  
  res.json({
    hasToken,
    isExpired,
    action: hasToken ? (isExpired ? "refresh needed" : "token valid") : "authentication needed",
    links: {
      auth: '/auth/hubspot',
      forceAuth: '/auth/hubspot?force=true', // Link to force reauthorization
      logout: '/auth/logout'
    }
  });
});

// Debug endpoint to check HubSpot tokens and API
app.get('/api/hubspot/debug', async (req, res) => {
  try {
    // Display current token info
    const tokenInfo = {
      hasToken: !!hubspotTokens,
      accessToken: hubspotTokens ? hubspotTokens.access_token.substring(0, 10) + '...' : null,
      hasRefreshToken: !!hubspotTokens?.refresh_token,
      expiry: hubspotTokens ? new Date(hubspotTokens.expiry_date).toISOString() : null,
      isExpired: hubspotTokens ? Date.now() >= hubspotTokens.expiry_date : null
    };
    
    // Try to make a test API call
    let apiResponse = null;
    let apiError = null;
    
    if (hubspotTokens && hubspotTokens.access_token) {
      try {
        const response = await axios.get('https://api.hubapi.com/crm/v3/schemas/contacts', {
          headers: {
            'Authorization': `Bearer ${hubspotTokens.access_token}`
          }
        });
        apiResponse = {
          status: response.status,
          hasData: !!response.data,
          properties: response.data.properties ? Object.keys(response.data.properties).length : 0
        };
      } catch (error) {
        apiError = {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        };
        
        // If we get a 401, try to refresh the token
        if (error.response?.status === 401) {
          const refreshed = await refreshToken();
          if (refreshed) {
            try {
              const retryResponse = await axios.get('https://api.hubapi.com/crm/v3/schemas/contacts', {
                headers: {
                  'Authorization': `Bearer ${hubspotTokens.access_token}`
                }
              });
              apiResponse = {
                status: retryResponse.status,
                hasData: !!retryResponse.data,
                properties: retryResponse.data.properties ? Object.keys(retryResponse.data.properties).length : 0,
                note: "This was after token refresh"
              };
            } catch (retryError) {
              apiError.retryError = {
                message: retryError.message,
                status: retryError.response?.status,
                data: retryError.response?.data
              };
            }
          } else {
            apiError.refreshResult = "Token refresh failed";
          }
        }
      }
    }
    
    res.json({
      tokenInfo,
      apiResponse,
      apiError,
      env: {
        hasAppId: !!process.env.HUBSPOT_APP_ID,
        hasClientId: !!process.env.HUBSPOT_CLIENT_ID,
        hasClientSecret: !!process.env.HUBSPOT_CLIENT_SECRET
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Debug endpoint error",
      message: error.message
    });
  }
});

// Get contacts from HubSpot
app.get('/api/hubspot/contacts', async (req, res) => {
  try {
    // Check if we have tokens
    if (!hubspotTokens || !hubspotTokens.access_token) {
      return res.status(401).json({
        error: 'Authentication required',
        authUrl: '/auth/hubspot'
      });
    }
    
    // Check if token needs refresh
    if (hubspotTokens.expiry_date && Date.now() >= hubspotTokens.expiry_date - 5 * 60 * 1000) {
      console.log('Token expired or about to expire, refreshing...');
      const refreshed = await refreshToken();
      if (!refreshed) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Failed to refresh authentication token',
          authUrl: '/auth/hubspot'
        });
      }
    }
    
    // Get the access token
    const accessToken = hubspotTokens.access_token;
    
    // Call HubSpot API to get contacts - using simple endpoint first
    const response = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts', {
      params: {
        limit: 100 // Limit results to avoid large payloads
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    // Extract contact data
    const contacts = response.data.results || [];
    
    res.json({
      status: 'success',
      message: 'Retrieved contacts successfully',
      count: contacts.length,
      contacts: contacts,
      links: {
        lists: '/api/hubspot/lists',
        logout: '/auth/logout'
      }
    });
  } catch (error) {
    console.error('Error fetching HubSpot contacts:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    res.status(500).json({
      error: 'Failed to access HubSpot CRM',
      message: error.message,
      details: error.response?.data,
      authUrl: '/auth/hubspot?force=true'
    });
  }
});

// Get lists from HubSpot
app.get('/api/hubspot/lists', async (req, res) => {
  try {
    // Check if we have tokens
    if (!hubspotTokens || !hubspotTokens.access_token) {
      return res.status(401).json({
        error: 'Authentication required',
        authUrl: '/auth/hubspot'
      });
    }
    
    // Check if token needs refresh
    if (hubspotTokens.expiry_date && Date.now() >= hubspotTokens.expiry_date - 5 * 60 * 1000) {
      console.log('Token expired or about to expire, refreshing...');
      const refreshed = await refreshToken();
      if (!refreshed) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Failed to refresh authentication token',
          authUrl: '/auth/hubspot'
        });
      }
    }
    
    const accessToken = hubspotTokens.access_token;
    
    // Call HubSpot API to get lists - using correct endpoint
    const response = await axios.get('https://api.hubapi.com/contacts/v1/lists', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    // Extract data
    const lists = response.data.lists || [];
    
    res.json({
      status: 'success',
      count: lists.length,
      lists: lists,
      links: {
        contacts: '/api/hubspot/contacts',
        logout: '/auth/logout'
      }
    });
  } catch (error) {
    console.error(`Error fetching HubSpot lists:`, error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    res.status(500).json({
      error: `Failed to access HubSpot lists`,
      message: error.message,
      details: error.response?.data,
      links: {
        contacts: '/api/hubspot/contacts',
        authenticate: '/auth/hubspot?force=true'
      }
    });
  }
});

// Detailed debug endpoint for HubSpot API
app.get('/api/hubspot/detailed-debug', async (req, res) => {
  try {
    // Check environment variables
    const envInfo = {
      APP_ID: process.env.HUBSPOT_APP_ID ? 'Set' : 'Not set',
      CLIENT_ID: process.env.HUBSPOT_CLIENT_ID ? 'Set' : 'Not set',
      CLIENT_SECRET: process.env.HUBSPOT_CLIENT_SECRET ? 'Set' : 'Not set',
    };

    // Token info
    const tokenInfo = {
      hasToken: !!hubspotTokens,
      tokenDetails: hubspotTokens ? {
        accessTokenFirst10Chars: hubspotTokens.access_token ? hubspotTokens.access_token.substring(0, 10) + '...' : null,
        refreshTokenExists: !!hubspotTokens.refresh_token,
        expiryDate: hubspotTokens.expiry_date ? new Date(hubspotTokens.expiry_date).toISOString() : null,
        isExpired: hubspotTokens.expiry_date ? Date.now() >= hubspotTokens.expiry_date : null,
        timeToExpiry: hubspotTokens.expiry_date ? Math.floor((hubspotTokens.expiry_date - Date.now()) / 1000) + ' seconds' : null
      } : null
    };

    // Log additional debug info
    console.log('=== DETAILED HUBSPOT DEBUG ===');
    console.log('Environment info:', envInfo);
    console.log('Token info:', tokenInfo);

    // Test API calls - try multiple endpoints to see which ones work
    const apiResponses = {};
    const apiErrors = {};
    
    if (hubspotTokens && hubspotTokens.access_token) {
      const accessToken = hubspotTokens.access_token;
      const testEndpoints = [
        {name: 'contacts-schema', url: 'https://api.hubapi.com/crm/v3/schemas/contacts'},
        {name: 'contacts', url: 'https://api.hubapi.com/crm/v3/objects/contacts'},
        {name: 'lists', url: 'https://api.hubapi.com/contacts/v1/lists'},
        {name: 'properties', url: 'https://api.hubapi.com/properties/v1/contacts/properties'},
        {name: 'authentication-status', url: 'https://api.hubapi.com/oauth/v1/access-tokens/' + accessToken}
      ];

      for (const endpoint of testEndpoints) {
        try {
          console.log(`Testing endpoint: ${endpoint.name} (${endpoint.url})`);
          const response = await axios.get(endpoint.url, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          apiResponses[endpoint.name] = {
            status: response.status,
            statusText: response.statusText,
            hasData: !!response.data,
            dataPreview: JSON.stringify(response.data).substring(0, 200) + '...'
          };
          console.log(`${endpoint.name} success:`, apiResponses[endpoint.name]);
        } catch (error) {
          apiErrors[endpoint.name] = {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
          };
          console.log(`${endpoint.name} error:`, apiErrors[endpoint.name]);
        }
      }

      // Try refresh token if we have errors
      if (Object.keys(apiErrors).length > 0 && hubspotTokens.refresh_token) {
        console.log('Attempting token refresh...');
        const refreshed = await refreshToken();
        if (refreshed) {
          apiResponses['after_refresh'] = {message: 'Token refreshed successfully'};
          
          // Retry the first failed endpoint
          const failedEndpoint = testEndpoints.find(ep => apiErrors[ep.name]);
          if (failedEndpoint) {
            try {
              console.log(`Retrying endpoint after refresh: ${failedEndpoint.name}`);
              const retryResponse = await axios.get(failedEndpoint.url, {
                headers: {
                  'Authorization': `Bearer ${hubspotTokens.access_token}`
                }
              });
              
              apiResponses['retry_after_refresh'] = {
                endpoint: failedEndpoint.name,
                status: retryResponse.status,
                statusText: retryResponse.statusText,
                hasData: !!retryResponse.data
              };
              console.log('Retry success:', apiResponses['retry_after_refresh']);
            } catch (retryError) {
              apiErrors['retry_after_refresh'] = {
                endpoint: failedEndpoint.name,
                message: retryError.message,
                status: retryError.response?.status,
                statusText: retryError.response?.statusText,
                data: retryError.response?.data
              };
              console.log('Retry failed:', apiErrors['retry_after_refresh']);
            }
          }
        } else {
          apiErrors['refresh_attempt'] = {message: 'Token refresh failed'};
          console.log('Token refresh failed');
        }
      }
    }

    // Return all collected debug info
    res.json({
      environment: envInfo,
      token: tokenInfo,
      apiResponses,
      apiErrors,
      suggestions: [
        "If you see 403 errors, check that your scopes include the necessary permissions",
        "Check that your app is properly configured in HubSpot developer portal",
        "Verify that your CLIENT_ID and CLIENT_SECRET are correct",
        "Try logging out and authenticating again"
      ],
      links: {
        authenticate: '/auth/hubspot',
        forceAuth: '/auth/hubspot?force=true',
        logout: '/auth/logout'
      }
    });
  } catch (error) {
    console.error('Error in detailed debug endpoint:', error);
    res.status(500).json({
      error: "Detailed debug error",
      message: error.message,
      stack: error.stack
    });
  }
});

// Start server (only in development - not needed in serverless)
if (!isProduction) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// For serverless deployment
module.exports = app;