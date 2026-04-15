# How to Access BOM Manager

The BOM Manager is fully functional and operational. Follow these steps to access it:

## Step 1: Start the Servers

Make sure both servers are running:

```bash
cd /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification
bash start-servers.sh
```

You should see:
```
✓ API Server started (PID: XXXX)
✓ Frontend Server started (PID: XXXX)
✓ API Server is responding
```

## Step 2: Open the Application

Open your browser and go to:
```
http://localhost:5173
```

## Step 3: Log In

You will see the login page. Select:

**Role:** Engineer (Full Access)

**Name:** Choose one of:
- Umesh Nagile
- Dhupchand Bhardwaj  
- Maruti Birader
- Or enter your own name

Click **Login**

## Step 4: Navigate to BOMs

From the Dashboard:
1. Look for "BOMs" in the left sidebar menu
2. Click "BOMs" to see the list of all BOMs
3. Click any BOM to open it

## Step 5: Use the BOM Manager

Once you open a BOM, you will see:

### Green "➕ ADD ITEM" Button
- Located at the top right of the page
- Click to add a new component to the BOM

### Add Item Form
- Fill in the required fields:
  - **Feeder Number** (required)
  - **Part Number** (required)
  - **Description** (optional)
  - **Location** (optional)
  - **Quantity** (required)
  - **MPN, Manufacturer, Package Size, Cost, Lead Time** (optional)
- Click **ADD** to save the item

### BOM Items Display
- Items appear as individual cards in a responsive grid
- **1 column** on mobile devices
- **2 columns** on tablets
- **3 columns** on desktops

### Edit Item
- Click the **Edit** button (pencil icon) on any card
- Modify the item details
- Click **UPDATE** to save changes

### Delete Item  
- Click the **Delete** button (trash icon) on any card
- Confirm deletion
- Item will be removed from the BOM

### Import CSV
- Click **IMPORT CSV** button
- Select a CSV file with the following headers:
  ```
  feederNumber,partNumber,description,location,quantity,mpn,manufacturer,packageSize
  ```
- Items will be bulk imported to the BOM

## Technical Details

**Frontend Server:** http://localhost:5173 (Vite React App)
**API Server:** http://localhost:3000 (Express.js backend)
**Database:** PostgreSQL with 19+ BOM items

**Features Implemented:**
- ✅ Responsive card grid layout
- ✅ Add new items (modal dialog)
- ✅ Edit existing items (modal dialog)
- ✅ Delete items (with confirmation)
- ✅ Import items from CSV
- ✅ Alternate component linking
- ✅ Real-time updates
- ✅ Authentication-based access control

## Troubleshooting

**If BOM Manager doesn't appear:**
- Make sure you are logged in as an "Engineer"
- Check that both servers are running (netstat -tlnp | grep -E "3000|5173")
- Clear browser cache and refresh the page

**If items don't save:**
- Check that the API server is responding: curl http://localhost:3000/api/bom/1
- Check API logs: tail -20 /media/abhishek-atole/Courses/Final\ SMT\ MES\ SYSTEM/SMTVerification/logs/api.log

**If page loads but no items show:**
- The BOM might have 0 items - click "ADD ITEM" to create the first one
- Check network requests in browser DevTools (F12) to see if API calls are successful

## Status

✅ **BOM Manager is fully operational and ready to use!**
