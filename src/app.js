require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

// Read configuration from environment variables
const PORT = process.env.PORT || 6931;

let access_token = process.env.ACCESS_TOKEN; // Only one access token
const refresh_token = process.env.REFRESH_TOKEN; // Only one refresh token
const main_url = process.env.MAIN_URL;

const app = express();
app.use(express.json());

// Function to verify the token
const verifyToken = async (token) => {
    try {
        const response = await axios.post('https://api.penpencil.co/v3/oauth/verify-token', {}, {
            headers: {
                'Authorization': `Bearer ${token}`,
                "randomId": "ae9e92ac-b162-4089-9830-1236bddf9761"
            }
        });
        return response.data.data.isVerified;
    } catch (error) {
        return false;
    }
};

// Function to refresh the token
const refreshToken = async () => {
    try {
        const response = await axios.post('https://api.penpencil.co/v3/oauth/refresh-token', {
            "refresh_token": refresh_token,
            "client_id": "system-admin"
        }, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                "randomId": "ae9e92ac-b162-4089-9830-1236bddf9761"
            }
        });

        // Update the access token
        access_token = response.data.data.access_token;
        console.log(`Access Token Updated`);
        return access_token;
    } catch (error) {
        console.error(`Error refreshing token:`, error.message);
        return null;
    }
};

// Route to handle the main logic
app.get('/', async (req, res) => {
    const videoId = req.query.id;
    let token = req.query.token || access_token; // Use query token if provided, otherwise use the access token from environment
    const quality = req.query.quality || "720";

    // Verify the token
    let isTokenVerified = await verifyToken(token);
    if (!isTokenVerified) {
        token = await refreshToken();  // Refresh token if verification fails
        if (!token) {
            return res.status(400).send({ msg: "Unable to refresh token" });
        }
        isTokenVerified = await verifyToken(token);
    }

    if (isTokenVerified) {
        if (!videoId) {
            return res.status(400).send({ msg: "No ID Parameter Found" });
        }

        try {
            const policyEncrypted = await axios.post('https://api.penpencil.co/v3/files/send-analytics-data', {
                'url': `https://d1d34p8vz63oiq.cloudfront.net/${videoId}/hls/`
            }, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 24_6 like Mac OS X) AppleWebKit/605.5.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
                    'Content-Type': 'application/json',
                    'client-type': 'WEB',
                    'Authorization': `Bearer ${token}`,
                }
            });

            const getDecryptCookie = (cookie) => {
                const key = Buffer.from('pw3c199c2911cb437a907b1k0907c17n', 'utf8');
                const iv = Buffer.from('5184781c32kkc4e8', 'utf8');
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

                let decryptedCookie = decipher.update(cookie, 'base64', 'utf8');
                decryptedCookie += decipher.final('utf8');
                return decryptedCookie;
            };

            const parts = policyEncrypted.data.data.split('&');
            let decryptedResponse = '';
            parts.forEach((part) => {
                const [name, value] = part.split('=');
                const decryptedValue = getDecryptCookie(value);
                decryptedResponse += `${name}=${decryptedValue}&`;
            });
            decryptedResponse = decryptedResponse.slice(0, -1);

            const Url = `https://api-six-navy.vercel.app/${videoId}/hls/${quality}/main.m3u8`;

            try {
                const main_data = await axios.get(Url);

                res.set('Content-Type', 'text/plain');
                res.set('Access-Control-Allow-Origin', '*');
                res.status(200).send(main_data.data);
            } catch (error) {
                res.status(400).send({ msg: "Your video URL is incorrect or Please choose another resolution" });
            }
        } catch (error) {
            res.status(500).send("Error on privacy link: " + error.message);
        }
    } else {
        res.status(401).send("Invalid or expired token.");
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
