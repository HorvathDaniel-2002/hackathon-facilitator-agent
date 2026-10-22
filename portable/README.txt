HACKATHON FACILITATOR - FULL PORTABLE APPLICATION
=================================================

This is the original full local application shown in the product walkthrough,
not the reduced Browser Edition.

START
-----
1. Extract the complete ZIP into a normal writable folder.
2. Open Start-Hackathon-Facilitator.cmd.
3. Keep the console window open while using the application.

The launcher automatically selects native x64 or Windows ARM64, starts the
included trusted Node.js runtime on numeric loopback only, and opens your default
browser. No Store installation, admin rights, Node.js, npm, Azure account,
Copilot subscription or cloud AI key is required.

STOP
----
Open Stop-Hackathon-Facilitator.cmd, or press Ctrl+C in the launcher window.
Always stop the application before copying or backing up its database.

DATA AND BACKUP
---------------
Workspace data:
  %APPDATA%\Hackathon Facilitator Portable\data

Open Open-Hackathon-Data-Folder.cmd to view the profile.
After stopping the application, open Backup-Hackathon-Workspace.cmd to create a
timestamped copy under:
  %APPDATA%\Hackathon Facilitator Portable\backups

SCOPE
-----
- Local single-user application with fictional starter data and mock AI.
- No Entra SSO, cloud synchronization, live AI or corporate approval is included.
- Use approved, non-sensitive information only.
- The package is portable and unsigned as a ZIP; do not disable Windows or
  organizational protections if a device blocks downloaded scripts or files.
- Windows x64 and Windows ARM64 are supported. Windows 32-bit, macOS and Linux
  are not included in this package.

Created by Daniel Horvath - dahorvath@microsoft.com
Experimental MVP; not an official Microsoft product.
