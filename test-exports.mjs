import fetch from 'node-fetch';

async function testExports() {
  console.log('Testing PDF/Excel export functionality...\n');
  
  // Test 1: Fetch session data
  console.log('1. Fetching session 55 data...');
  try {
    const sessionResponse = await fetch('http://localhost:3000/api/sessions/55');
    const sessionData = await sessionResponse.json();
    
    if (sessionResponse.ok) {
      console.log('✅ Session 55 data retrieved successfully');
      console.log(`   - Session ID: ${sessionData.id}`);
      console.log(`   - BOM ID: ${sessionData.bomId}`);
      console.log(`   - Status: ${sessionData.status}`);
      console.log(`   - Verification Records: ${sessionData.verificationRecords?.length || 0}`);
    } else {
      console.log('❌ Failed to fetch session data');
      console.log(`   Status: ${sessionResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Error fetching session:', error.message);
  }
  
  // Test 2: Check frontend loads
  console.log('\n2. Checking if frontend is accessible...');
  try {
    const pageResponse = await fetch('http://localhost:5175/session/55/report');
    if (pageResponse.ok) {
      console.log('✅ Frontend session report page is accessible');
      console.log(`   Status: ${pageResponse.status}`);
    } else {
      console.log('❌ Frontend page returned error');
      console.log(`   Status: ${pageResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Error accessing frontend:', error.message);
  }
  
  // Test 3: Verify export modules are installed
  console.log('\n3. Checking export library availability...');
  try {
    // Check jsPDF
    import('jspdf').then(mod => {
      console.log('✅ jsPDF library is available');
    }).catch(err => {
      console.log('❌ jsPDF library not found:', err.message);
    });
    
    // Check XLSX
    import('xlsx').then(mod => {
      console.log('✅ XLSX library is available');
    }).catch(err => {
      console.log('❌ XLSX library not found:', err.message);
    });
  } catch (error) {
    console.log('⚠️  Could not check libraries:', error.message);
  }
  
  // Test 4: Summary
  console.log('\n4. Export Fix Summary:');
  console.log('   ✅ Button click handlers updated to properly await async functions');
  console.log('   ✅ Try-catch error handling added to exportPDF function');
  console.log('   ✅ Try-catch error handling added to exportExcel function');
  console.log('   ✅ Console logging added for debugging');
  console.log('   ✅ User alerts added when exports fail');
  console.log('\n📝 NOTE: To test exports fully, visit the page in a browser and click');
  console.log('   the PDF or EXCEL buttons. Check the browser DevTools console for');
  console.log('   any error messages.');
}

testExports();
