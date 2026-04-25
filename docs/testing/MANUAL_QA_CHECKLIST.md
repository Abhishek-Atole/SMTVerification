# Manual QA Checklist

Use this checklist in the browser before sign-off. Mark each item complete only after verifying the expected result.

## Authentication

1. Log in with valid credentials.
   - Expected result: You are redirected to the dashboard.
2. Log in with the wrong password.
   - Expected result: An error message appears and no redirect occurs.
3. Open DevTools, then Application, then Local Storage.
   - Expected result: No token or user object is stored there.
4. Open DevTools, then Application, then Cookies.
   - Expected result: `smt_token` exists and `HttpOnly` is `true`.
5. Close the browser and reopen it.
   - Expected result: The session is restored automatically.
6. Click logout.
   - Expected result: The cookie is removed and you are redirected to the login page.
7. Paste the API URL directly into the browser without logging in.
   - Expected result: The API returns `401`, not data.

## Feeder Verification

1. Scan feeder `YSM-001`.
   - Expected result: A green `SUCCESS` notification appears.
2. Wait for the notification to auto-dismiss.
   - Expected result: It disappears after 3 seconds.
3. Scan the wrong MPN.
   - Expected result: A red `ERROR` notification appears and the buzzer sounds.
4. Leave the error on screen.
   - Expected result: It stays visible for 10 seconds.
5. Dismiss the error.
   - Expected result: The feeder number input is focused again.
6. Scan the correct MPN2 (`CC0603KRX7R9BB472`).
   - Expected result: An amber `WARNING` notification with `Alternate component used` appears.
7. Scan `YSM-001` again after it is already verified.
   - Expected result: An amber `DUPLICATE` notification appears and no buzzer sounds.
8. Continue through the MPN workflow until the lot code field appears.
   - Expected result: The lot code input is shown after MPN verification.
9. Press Enter with an empty lot code.
   - Expected result: The save skips the lot code and still persists the record.
10. Verify several feeders in sequence.
    - Expected result: The progress bar increments correctly after each feeder.
11. Reach 100% progress.
    - Expected result: The `Proceed to Splicing` button appears.

## Splicing

1. Open the Splicing page before reaching 100% progress.
   - Expected result: The page is not accessible.
2. Navigate directly to `/splicing` at 50% progress.
   - Expected result: You are redirected away.
3. Scan the wrong feeder number.
   - Expected result: An error notification appears.
4. Scan the wrong old spool MPN.
   - Expected result: An error notification appears and the buzzer sounds.
5. Scan the wrong new spool MPN.
   - Expected result: An error notification appears and the buzzer sounds.
6. Enter all 3 correct values.
   - Expected result: The splicing record is saved and the fields reset.

## Role Isolation

1. Log in as Operator A and start a changeover.
   - Expected result: The session is visible to Operator A.
2. Log in as Operator B in an incognito window.
   - Expected result: Operator B cannot see Operator A's session.
3. Log in as QA in an incognito window.
   - Expected result: QA can see all sessions in read-only mode.

## Responsive UI

1. Scan 20 feeders.
   - Expected result: The log table scrolls internally.
2. Confirm the input fields remain visible.
   - Expected result: Inputs are not pushed off screen.
3. Resize the browser to 768px width.
   - Expected result: The layout remains usable.
4. Resize the browser to 1440px width.
   - Expected result: The layout does not look stretched.

## Rate Limiting

1. Send 11 login requests rapidly.
   - Expected result: The 11th request returns `429 Too Many Requests`.
2. Wait 15 minutes, or reduce the rate-limit window in a local test environment.
   - Expected result: Login works again.

## Network Errors

1. Disconnect from the network mid-scan.
   - Expected result: An error notification appears and the failure is not silent.
2. Reconnect the network.
   - Expected result: You can resume scanning.