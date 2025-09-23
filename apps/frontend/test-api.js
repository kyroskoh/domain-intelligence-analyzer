const axios = require('axios');

async function testApiConnection() {
  try {
    console.log('Testing API connection...');
    
    // Test health endpoint
    const healthResponse = await axios.get('http://localhost:4001/health');
    console.log('✅ Health check successful:', healthResponse.data);
    
    // Test a simple domain analysis
    const analysisResponse = await axios.get('http://localhost:4001/api/analyze/example.com');
    console.log('✅ Domain analysis test successful');
    console.log('Response structure:', Object.keys(analysisResponse.data));
    
    if (analysisResponse.data.whois) {
      console.log('✅ WHOIS data available');
    }
    
    if (analysisResponse.data.dns) {
      console.log('✅ DNS data available');
    }
    
    if (analysisResponse.data.rdap) {
      console.log('✅ RDAP data available');
    }
    
  } catch (error) {
    console.error('❌ API connection failed:');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    
    console.log('\n💡 Make sure the backend server is running on port 4001');
    console.log('Run: cd ../backend && npm run dev');
  }
}

testApiConnection();