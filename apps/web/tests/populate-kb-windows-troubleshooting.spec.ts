import { test } from '@playwright/test';

const articles = [
  {
    title: 'How to Clear Your Browser Cache and Cookies',
    summary: 'Learn how to clear cache and cookies in Windows browsers to resolve loading issues.',
    tags: ['browser', 'cache', 'troubleshooting', 'windows'],
    content: '<h2>Clear Cache in Chrome</h2><p>1. Open Chrome and press Ctrl + Shift + Delete</p><p>2. Select "All time" from the time range dropdown</p><p>3. Check "Cookies and other site data" and "Cached images and files"</p><p>4. Click "Clear data"</p><h2>Clear Cache in Firefox</h2><p>1. Press Ctrl + Shift + Delete</p><p>2. Select "Everything" from the time range</p><p>3. Check the boxes for Cookies and Cache</p><p>4. Click "Clear Now"</p>',
    visibility: 'PUBLIC',
  },
  {
    title: 'Resolve Windows Update Stuck or Hung Installation',
    summary: 'Steps to fix Windows Update that appears frozen or taking too long to complete.',
    tags: ['windows-update', 'stuck', 'installation', 'system'],
    content: '<h2>Quick Fixes</h2><p>1. Restart your computer - often this will resume the update process</p><p>2. Open Windows Update settings (Settings > System > Update & Security)</p><p>3. Click "Check for updates" to resume the process</p><h2>Advanced Steps</h2><p>1. Press Windows + R to open Run dialog</p><p>2. Type "services.msc" and press Enter</p><p>3. Find "Windows Update" service and restart it</p><p>4. Return to Windows Update settings and check for updates again</p>',
    visibility: 'PUBLIC',
  },
  {
    title: 'Fix High CPU or Memory Usage on Windows',
    summary: 'Identify and resolve processes consuming excessive system resources.',
    tags: ['performance', 'cpu', 'memory', 'optimization', 'windows'],
    content: '<h2>Using Task Manager</h2><p>1. Right-click the taskbar and select "Task Manager"</p><p>2. Click the "Performance" tab to see overall usage</p><p>3. Click the "Processes" tab to see which apps use the most resources</p><h2>Common Culprits</h2><ul><li>svchost.exe - Windows service host (check for malware)</li><li>Windows Update processes - wait for update to complete</li><li>Antivirus scanning - schedule scans during off-peak hours</li><li>Disk indexing - disable if not needed</li></ul><h2>Disable Startup Programs</h2><p>1. Open Task Manager</p><p>2. Go to Startup tab</p><p>3. Right-click unnecessary apps and select "Disable"</p>',
    visibility: 'PUBLIC',
  },
  {
    title: 'Resolve Bluetooth Connectivity Issues on Windows 10/11',
    summary: 'Troubleshoot common Bluetooth connection problems with peripherals.',
    tags: ['bluetooth', 'connectivity', 'devices', 'wireless', 'windows'],
    content: '<h2>Basic Troubleshooting</h2><p>1. Check if Bluetooth is enabled in Settings > Devices > Bluetooth & devices</p><p>2. Ensure the Bluetooth device is powered on and in pairing mode</p><p>3. Move the device closer to your computer (within 10 meters)</p><p>4. Remove any obstacles between the device and computer</p><h2>Reset Bluetooth</h2><p>1. In Windows Settings, go to Devices > Bluetooth & devices</p><p>2. Click on the connected device and select "Remove device"</p><p>3. Click "Add device" and re-pair from scratch</p><h2>Update Drivers</h2><p>1. Right-click Start and open "Device Manager"</p><p>2. Expand "Bluetooth"</p><p>3. Right-click your Bluetooth adapter and select "Update driver"</p><p>4. Choose "Search automatically for updated driver software"</p>',
    visibility: 'PUBLIC',
  },
  {
    title: 'Fix "No Internet Connection" Despite WiFi Being Connected',
    summary: 'Resolve situations where WiFi is connected but internet access is unavailable.',
    tags: ['network', 'wifi', 'internet', 'connection', 'troubleshooting'],
    content: '<h2>Check Actual Connection</h2><p>1. Right-click the network icon in the system tray</p><p>2. Select "Open Network & Internet settings"</p><p>3. Click "Advanced network settings" to see connection details</p><h2>Restart Network Equipment</h2><p>1. Restart your router (unplug for 30 seconds, plug back in)</p><p>2. Restart your modem</p><p>3. Restart your computer</p><h2>Reset Network Settings</h2><p>1. Go to Settings > System > Troubleshoot > Other troubleshooters</p><p>2. Find "Network Troubleshooter" and click Run</p><p>3. Follow the on-screen instructions</p><p>4. Or run: ipconfig /release and ipconfig /renew in Command Prompt</p>',
    visibility: 'PUBLIC',
  },
  {
    title: 'Resolve Windows Blue Screen of Death (BSOD)',
    summary: 'Troubleshoot and recover from Blue Screen errors in Windows.',
    tags: ['bsod', 'crash', 'error', 'system', 'advanced'],
    content: '<h2>Immediate Action</h2><p>1. Note the error code shown on the blue screen</p><p>2. Let the system reboot automatically</p><p>3. If it gets stuck, force a restart by holding the power button</p><h2>Common Causes</h2><ul><li>Outdated drivers (especially graphics and chipset)</li><li>Malware or virus infection</li><li>Hardware failure or overheating</li><li>Recently installed software or updates</li></ul><h2>Recovery Steps</h2><p>1. Boot into Safe Mode (F8 during startup)</p><p>2. Check Windows Event Viewer for error details</p><p>3. Uninstall any recently installed programs</p><p>4. Update all drivers from Device Manager</p><p>5. Run a full system scan with antivirus</p>',
    visibility: 'INTERNAL',
  },
  {
    title: 'Enable or Disable Windows Firewall',
    summary: 'Configure Windows Firewall settings for security and application access.',
    tags: ['firewall', 'security', 'network', 'windows'],
    content: '<h2>Open Windows Defender Firewall</h2><p>1. Press Windows + R and type "wf.msc" then Enter</p><p>2. Or go to Settings > Privacy & Security > Windows Defender Firewall</p><h2>Enable or Disable Firewall</h2><p>1. In Windows Defender Firewall, click "Turn Windows Defender Firewall on or off"</p><p>2. Check or uncheck boxes for Private and Public networks</p><p>3. Click OK</p><h2>Allow an App Through Firewall</h2><p>1. Open Windows Defender Firewall</p><p>2. Click "Allow an app through firewall"</p><p>3. Click "Change settings" (may require admin)</p><p>4. Click "Allow another app" to add a new app</p><p>5. Browse and select the application, then click Add</p>',
    visibility: 'PUBLIC',
  },
  {
    title: 'Uninstall Programs Using Control Panel or Settings',
    summary: 'Remove unwanted software from Windows 10 and Windows 11.',
    tags: ['uninstall', 'programs', 'applications', 'cleanup', 'windows'],
    content: '<h2>Using Windows Settings (Recommended)</h2><p>1. Go to Settings > Apps > Apps & features</p><p>2. Scroll to find the program you want to remove</p><p>3. Click the three dots menu (...) next to the program</p><p>4. Select "Uninstall" and follow the prompts</p><h2>Using Control Panel (Legacy)</h2><p>1. Press Windows + R and type "control" then Enter</p><p>2. Click "Programs and Features"</p><p>3. Find the program and click it</p><p>4. Click "Uninstall" at the top</p><p>5. Follow the uninstall wizard</p><h2>Remove Stubborn Programs</h2><p>1. Boot into Safe Mode</p><p>2. Attempt uninstall again</p><p>3. Use third-party uninstallers like Revo Uninstaller</p>',
    visibility: 'PUBLIC',
  },
  {
    title: 'Fix Printer Not Detected or Not Printing',
    summary: 'Troubleshoot printer connectivity and printing issues in Windows.',
    tags: ['printer', 'printing', 'hardware', 'connectivity', 'windows'],
    content: '<h2>Basic Checks</h2><p>1. Ensure the printer is powered on and connected</p><p>2. Check that the printer is connected to the correct network</p><p>3. Verify there is paper and ink/toner in the printer</p><p>4. Look for error lights or messages on the printer display</p><h2>Troubleshoot in Windows</h2><p>1. Go to Settings > Devices > Printers & scanners</p><p>2. Click on your printer and select "Open queue"</p><p>3. If there are stuck print jobs, clear the queue</p><p>4. Click "Troubleshoot" at the top for automated fixes</p><h2>Reinstall Printer Drivers</h2><p>1. Right-click Start and open Device Manager</p><p>2. Expand "Printers"</p><p>3. Right-click your printer and select "Uninstall device"</p><p>4. Go to Settings > Devices > Printers & scanners</p><p>5. Click "Add a printer or scanner" to reinstall</p>',
    visibility: 'PUBLIC',
  },
  {
    title: 'Reset Windows Password Using Command Prompt',
    summary: 'Recover access to a Windows account when password is forgotten.',
    tags: ['password', 'account', 'recovery', 'security', 'advanced'],
    content: '<h2>Using Password Reset Disk</h2><p>1. At the login screen, enter any password</p><p>2. Click "Reset password" link below the password field</p><p>3. If you created a password reset disk previously, insert it now</p><p>4. Follow the Password Reset Wizard</p><h2>Using Another Admin Account</h2><p>1. Log in with a different admin account</p><p>2. Go to Settings > Accounts > Other people</p><p>3. Click the account with forgotten password</p><p>4. Click "Change" under Password section</p><p>5. You can enter a new password for that account</p><h2>Online Account Recovery</h2><p>1. Click "I forgot my password" on the login screen</p><p>2. Verify your identity using recovery email or phone</p><p>3. Follow the Microsoft account recovery process</p>',
    visibility: 'INTERNAL',
  },
];

test('Create KB articles via API', async ({ page }) => {
  // Get auth context from storage
  await page.goto('/dashboard');

  let successCount = 0;
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    try {
      const response = await page.request.post('/api/v1/knowledge', {
        data: {
          title: article.title,
          summary: article.summary,
          content: article.content,
          tags: article.tags,
          visibility: article.visibility,
          isKnownError: false,
        },
      });

      const status = response.status();
      const body = await response.text();

      if (response.ok()) {
        console.log(`✓ (${status}) Created article ${i + 1}/${articles.length}: ${article.title}`);
        console.log(`  Response: ${body.substring(0, 100)}`);
        successCount++;
      } else {
        console.log(`✗ (${status}) Failed to create "${article.title}"`);
        console.log(`  Response: ${body}`);
      }
    } catch (err) {
      console.log(`✗ Error creating "${article.title}": ${err}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Successfully created: ${successCount}/${articles.length} articles`);
});
