import axios from 'axios';

const API_BASE = 'http://localhost:4001/api/v1';
const email = 'testui@example.com';
const password = 'TestPass123!';
const displayName = 'Test UI User';

async function registerUser() {
  try {
    const registerRes = await axios.post(`${API_BASE}/auth/register`, {
      email,
      password,
      displayName,
    });
    console.log('User registered:', registerRes.data);
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password,
      deviceId: 'ui-test-device',
      platform: 'web',
    });
    console.log('Login successful. Tokens:');
    console.log('Access Token:', loginRes.data.accessToken);
    console.log('Refresh Token:', loginRes.data.refreshToken);
    console.log('Display Name:', displayName);
  } catch (err) {
    console.error('Error registering or logging in:', err?.response?.data || err.message);
  }
}

registerUser();
