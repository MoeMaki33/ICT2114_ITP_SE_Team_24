# Corrosion Protection Management and Monitoring Web Application

## Team Name
**SE_Team_24**

## Project Title
**SE_16: Development of Corrosion Protection Management and Monitoring Web Application**

## Project Overview

This project aims to develop a web-based application that supports corrosion protection management and monitoring activities in engineering and research environments.

The system provides a centralised digital platform for managing corrosion-related data, recording visual inspection results, storing supporting images, tracking corrosion protection status, and generating useful analytics. By digitalising the corrosion monitoring workflow, the application aims to improve the accuracy, transparency, and efficiency of inspection and asset condition monitoring tasks.

## Problem Statement

Corrosion monitoring is often dependent on manual inspection records, scattered documentation, and inconsistent tracking methods. This can make it difficult to maintain accurate asset condition records, compare inspection results over time, and monitor corrosion protection effectiveness.

This project addresses the need for a structured web application that allows users to manage corrosion inspection data more efficiently and visualise asset conditions over time.

## Key Features

- User-friendly web interface for corrosion monitoring
- Centralised storage of corrosion-related data
- Field observation recording
- Image upload and storage for inspection evidence
- Corrosion protection tracking
- Asset condition visualisation over time
- Corrosion analytics and reporting
- Database-driven data management
- Support for engineering and research workflows

## Target Users

This application is designed for users involved in corrosion monitoring, engineering inspections, research activities, and asset management.

Potential users include:

- Engineering researchers
- Corrosion monitoring teams
- Inspection personnel
- Asset management teams
- Academic or industry supervisors

## Technology Stack

### Frontend
- HTML, CSS, JavaScript
- Pages are served as `.php` so the server can check login/role before rendering (see Security below); there's no PHP templating of the markup itself, it's still plain HTML/CSS/JS

### Backend
- [Supabase](https://supabase.com) — hosted PostgreSQL database, authentication, and file storage, called directly from the browser via the Supabase JS client
- PHP — server-side session management and authentication gating (`www/php/`)

### Database
- PostgreSQL, managed via Supabase

### Security
- Every page that requires login checks a PHP session server-side before any HTML is sent (`www/php/session-guard.php`), rather than relying on client-side JavaScript alone
- Login flow verifies the Supabase access token server-side (`www/php/set-session.php`) before establishing that session

### Other Tools
- RESTful API via Supabase's auto-generated REST endpoints
- Version control with Git and GitHub
- XAMPP (Apache + PHP) for local development

## Proposed System Modules

### 1. User Management Module
Handles user authentication, user roles, and access control.

### 2. Asset Management Module
Allows users to create, view, update, and manage asset records related to corrosion monitoring.

### 3. Inspection Management Module
Enables users to record field observations, inspection findings, corrosion status, and related notes.

### 4. Image Management Module
Allows users to upload and store supporting images as evidence for corrosion inspections.

### 5. Corrosion Analytics Module
Generates analytics based on inspection records and corrosion-related data.

### 6. Visualisation Dashboard
Displays asset conditions, corrosion trends, and monitoring results over time.

### 7. Reporting Module
Supports the generation of reports for inspection records, corrosion status, and system data.

## Project Deliverables

The final deliverables for this project include:

- Fully functional corrosion management and monitoring web application
- System architecture and design documentation
- Database schema and technical specifications
- Deployment guide
- User manual
- Test reports
- Final project presentation and demonstration

## Project Objectives

The main objectives of this project are to:

1. Analyse user requirements for corrosion monitoring workflows
2. Design a suitable software architecture for the web application
3. Implement a full-stack web application for corrosion protection management
4. Store and manage corrosion-related data in a structured database
5. Provide analytics and visualisation features for asset condition monitoring
6. Conduct testing to ensure system reliability and usability
7. Prepare documentation for deployment, usage, and future maintenance

## Installation Guide

The frontend is static HTML/CSS/JS served through PHP (for server-side login/session checks), with Supabase as the backend. You only need XAMPP's Apache — MySQL isn't used.

### Prerequisites

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/) (LTS version) and npm
- [XAMPP](https://www.apachefriends.org/)

### 1. Clone the repository

Clone it wherever you like on your machine — it does **not** need to be inside XAMPP's `htdocs` folder.

```bash
git clone <repository-url>
cd ICT2114_ITP_SE_Team_24
```

### 2. Install project dependencies

```bash
npm install
```

This reads `package.json` and downloads the JS packages the site depends on (Supabase client, xlsx, etc.) into a local `node_modules/` folder. `node_modules` is not committed to git, so run this after every fresh clone or pull that changes `package.json`.

### 3. Point Apache at this project's `www` folder

Instead of copying the site into XAMPP's `htdocs`, point Apache directly at your cloned repo so there's only one copy of the code to keep in sync with git.

1. Open the XAMPP Control Panel → next to **Apache**, click **Config** → **httpd.conf** (or open `C:\xampp\apache\conf\httpd.conf` directly in a text editor).
2. Find these two lines near the top:
   ```
   DocumentRoot "C:/xampp/htdocs"
   <Directory "C:/xampp/htdocs">
   ```
3. Replace both paths with the full path to wherever **you** cloned this repo, plus `/www` at the end — it doesn't matter where that is on your machine, as long as both lines point to the same place. Use forward slashes even on Windows, e.g. if you cloned it to `C:\Projects\ICT2114_ITP_SE_Team_24`, use:
   ```
   DocumentRoot "C:/Projects/ICT2114_ITP_SE_Team_24/www"
   <Directory "C:/Projects/ICT2114_ITP_SE_Team_24/www">
   ```
4. Save the file.
5. Back in the XAMPP Control Panel, click **Stop** then **Start** next to Apache (if it was already running, it needs a restart to pick up the config change).

You only need to do this once per machine. If a teammate clones the repo to a different folder, they just use their own path in step 3.

### 4. Open it in your browser

Go to **`http://localhost/`**. Log in with your Supabase account credentials — no extra configuration is needed, the Supabase connection details are already set in `www/js/supabaseClient.js` and `www/php/config.php`.

### Troubleshooting

- **Apache won't start** — something else (Skype, IIS, another XAMPP instance) is already using port 80. Free up the port, or change Apache's `Listen` port in `httpd.conf`.
- **Blank page or "Object not found"** — double-check the `DocumentRoot`/`<Directory>` path in `httpd.conf` matches where you actually cloned the repo, and that you restarted Apache after editing it.
- **Redirected straight back to the login page** — you're not logged in, or your session expired; just sign in again.
- **Code changes not showing up** — hard refresh the page (`Ctrl+Shift+R`) to bypass the browser cache.
