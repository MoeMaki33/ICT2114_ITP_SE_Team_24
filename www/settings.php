<?php require __DIR__ . '/php/session-guard.php'; require_login(); ?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Settings</title>
    <link rel="icon" type="image/png" href="<?php echo asset_v('img/application logo.png'); ?>">
    <link rel="stylesheet" href="<?php echo asset_v('css/style.css'); ?>">
</head>

<body>
    <aside class="sidebar"></aside>
    <main class="main">
        <header class="topbar"></header>
        <section class="content settings-page" id="settingsPage">
            <div class="page-title settings-page-heading">
                <div>
                    <h1>Account and Application Settings</h1>
                    <p>Manage your account security, workspace preferences and dashboard layout.</p>
                </div>
            </div>

            <section class="card settings-account-overview" id="settingsAccountOverview" aria-live="polite" aria-busy="true">
                <div class="settings-loading-state">
                    <span class="settings-loading-avatar" aria-hidden="true"></span>
                    <div>
                        <strong>Loading account…</strong>
                        <p>Retrieving your authoritative profile.</p>
                    </div>
                </div>
            </section>

            <div class="settings-grid">
                <section class="card settings-card settings-profile-card">
                    <div class="settings-card-header">
                        <span class="settings-card-icon" aria-hidden="true"><i class="fa-solid fa-user"></i></span>
                        <div><h2>Profile</h2><p>Your application identity and access details.</p></div>
                    </div>
                    <div class="settings-form-grid">
                        <label class="settings-field settings-field-wide">Full name
                            <input id="settingsFullName" type="text" readonly aria-describedby="settingsProfileNote">
                        </label>
                        <label class="settings-field settings-field-wide">Email address
                            <input id="settingsEmail" type="email" readonly>
                        </label>
                        <label class="settings-field">Role
                            <input id="settingsRole" type="text" readonly>
                        </label>
                        <label class="settings-field">Account status
                            <input id="settingsAccountStatus" type="text" readonly>
                        </label>
                    </div>
                    <p class="settings-help" id="settingsProfileNote"><i class="fa-solid fa-lock" aria-hidden="true"></i> Profile details are managed by an administrator.</p>
                </section>

                <section class="card settings-card settings-security-card">
                    <div class="settings-card-header">
                        <span class="settings-card-icon" aria-hidden="true"><i class="fa-solid fa-shield-halved"></i></span>
                        <div><h2>Security</h2><p>Choose a new password for your account.</p></div>
                    </div>
                    <form id="settingsPasswordForm" novalidate>
                        <div id="settingsPasswordStepRequest">
                            <p class="settings-help"><i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i>For your security, every password change needs a verification code sent to your email address.</p>
                            <button class="btn btn-green" id="settingsSendCode" type="button"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> <span>Send Verification Code</span></button>
                        </div>
                        <div id="settingsPasswordStepChange" hidden>
                            <label class="settings-field">Verification code
                                <input id="settingsVerificationCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*" required>
                            </label>
                            <label class="settings-field settings-password-field">New password
                                <span class="settings-password-input">
                                    <input id="settingsNewPassword" type="password" minlength="8" autocomplete="new-password" required>
                                    <button type="button" class="settings-password-toggle" data-password-toggle="settingsNewPassword" aria-label="Show new password" aria-pressed="false"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
                                </span>
                            </label>
                            <label class="settings-field settings-password-field">Confirm new password
                                <span class="settings-password-input">
                                    <input id="settingsConfirmPassword" type="password" minlength="8" autocomplete="new-password" required>
                                    <button type="button" class="settings-password-toggle" data-password-toggle="settingsConfirmPassword" aria-label="Show confirmed password" aria-pressed="false"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>
                                </span>
                            </label>
                            <p class="settings-help">Use at least 8 characters. Password values are never stored by this application. Other devices are signed out after the change.</p>
                        </div>
                        <p class="settings-form-status" id="settingsPasswordStatus" role="status" aria-live="polite"></p>
                        <div class="settings-button-row" id="settingsPasswordActions" hidden>
                            <button class="btn btn-green" id="settingsChangePassword" type="submit"><i class="fa-solid fa-key" aria-hidden="true"></i> Change Password</button>
                            <button class="btn btn-light" id="settingsResendCode" type="button"><span>Resend Code</span></button>
                            <button class="btn btn-light" id="settingsCancelPasswordChange" type="button">Cancel</button>
                        </div>
                    </form>
                </section>

                <section class="card settings-card settings-workspace-card">
                    <div class="settings-card-header">
                        <span class="settings-card-icon" aria-hidden="true"><i class="fa-solid fa-sliders"></i></span>
                        <div><h2>Workspace Preferences</h2><p>Personalise your browser experience.</p></div>
                    </div>
                    <form id="settingsPreferencesForm">
                        <div class="settings-form-grid">
                            <label class="settings-field">Default landing page
                                <select id="settingsLandingPage">
                                    <option value="dashboard.php">Dashboard</option>
                                    <option value="weekly.php">Weekly Summary</option>
                                    <option value="testpoints.php">Test Points</option>
                                </select>
                            </label>
                            <label class="settings-field">Default table rows
                                <select id="settingsTableRows">
                                    <option value="10">10 rows</option>
                                    <option value="25">25 rows</option>
                                    <option value="50">50 rows</option>
                                </select>
                            </label>
                            <label class="settings-field settings-field-wide">Chart motion
                                <select id="settingsChartMotion">
                                    <option value="system">Follow system preference</option>
                                    <option value="reduced">Reduce chart motion</option>
                                </select>
                            </label>
                        </div>
                        <div class="settings-button-row">
                            <button class="btn btn-green" id="settingsSavePreferences" type="submit"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save Preferences</button>
                            <button class="btn btn-light" id="settingsResetPreferences" type="button"><i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i> Reset Interface Preferences</button>
                        </div>
                    </form>
                </section>

                <section class="card settings-card settings-dashboard-card">
                    <div class="settings-card-header">
                        <span class="settings-card-icon" aria-hidden="true"><i class="fa-solid fa-border-all"></i></span>
                        <div><h2>Dashboard Layout</h2><p>Restore the default card arrangement for your dashboard.</p></div>
                    </div>
                    <p class="settings-help">This removes only your saved dashboard layout. Monitoring data is not changed.</p>
                    <button class="btn btn-light" id="settingsResetDashboard" type="button"><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i> Reset Dashboard Layout</button>
                </section>

                <section class="card settings-card settings-operational-card">
                    <div class="settings-card-header">
                        <span class="settings-card-icon" aria-hidden="true"><i class="fa-solid fa-circle-info"></i></span>
                        <div><h2>Operational Reference</h2><p>Read-only application rules used across monitoring views.</p></div>
                    </div>
                    <dl class="settings-reference-list">
                        <div><dt>Reporting week</dt><dd>Monday to Sunday</dd></div>
                        <div><dt>Application timezone</dt><dd>Asia/Singapore</dd></div>
                        <div><dt>Protection threshold</dt><dd>Defined per Test Point</dd></div>
                        <div><dt>Weekly calculation</dt><dd>Reading-count weighted</dd></div>
                    </dl>
                    <a class="btn btn-light" href="testpoints.php" data-nav="testpoints.php"><i class="fa-solid fa-bullseye" aria-hidden="true"></i> View Test Points</a>
                </section>

                <section class="card settings-card settings-actions-card">
                    <div class="settings-card-header">
                        <span class="settings-card-icon" aria-hidden="true"><i class="fa-solid fa-right-from-bracket"></i></span>
                        <div><h2>Account Actions</h2><p>End this session or revoke all active sessions.</p></div>
                    </div>
                    <div class="settings-action-list">
                        <div><div><strong>Sign out</strong><p>End only the session on this browser.</p></div><button class="btn btn-light" id="settingsSignOut" type="button">Sign Out</button></div>
                        <div class="settings-danger-action"><div><strong>Sign out on all devices</strong><p>Revoke every active Supabase session for this account.</p></div><button class="btn btn-danger" id="settingsSignOutAll" type="button">Sign Out All Devices</button></div>
                    </div>
                </section>
            </div>
        </section>
    </main>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="<?php echo asset_v('js/auth-storage.js'); ?>"></script>
    <script src="<?php echo asset_v('js/config/supabase-config.js'); ?>"></script>
    <script src="<?php echo asset_v('js/config/app-settings.js'); ?>"></script>
    <script src="<?php echo asset_v('js/supabaseClient.js'); ?>"></script>
    <script src="<?php echo asset_v('js/services/status.js'); ?>"></script>
    <script src="<?php echo asset_v('js/repositories/supabase-repositories.js'); ?>"></script>
    <script src="<?php echo asset_v('js/app-preferences.js'); ?>"></script>
    <script src="<?php echo asset_v('js/common.js'); ?>"></script>
    <script src="<?php echo asset_v('js/toast.js'); ?>"></script>
    <script src="<?php echo asset_v('js/notifications.js'); ?>"></script>
    <script src="<?php echo asset_v('js/navigation-controller.js'); ?>"></script>
    <script src="<?php echo asset_v('js/password-flows.js'); ?>"></script>
    <script src="<?php echo asset_v('js/settings.js'); ?>"></script>
</body>

</html>
