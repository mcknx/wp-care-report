<?php
/**
 * Plugin Name: Bayview Health
 * Description: Read-only care-plan check: GET /wp-json/bayview/v1/health for the care-bot user (capability bayview_health).
 */
defined('ABSPATH') || exit;

// Local demo runs over plain http, where WordPress turns application passwords off; the endpoint needs them.
add_filter('wp_is_application_passwords_available', '__return_true');

add_action('rest_api_init', function () {
	register_rest_route('bayview/v1', '/health', [
		'methods'             => 'GET',
		'permission_callback' => fn() => current_user_can('bayview_health'),
		'callback'            => 'bayview_health',
	]);
});

function bayview_health() {
	require_once ABSPATH . 'wp-admin/includes/update.php';
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	wp_version_check();
	wp_update_plugins();
	wp_update_themes();

	$updates = get_site_transient('update_plugins')->response ?? [];
	$plugins = [];
	foreach (get_plugins() as $file => $p) {
		$plugins[] = [
			'slug'    => dirname($file) === '.' ? basename($file, '.php') : dirname($file),
			'version' => $p['Version'],
			'update'  => isset($updates[$file]) ? $updates[$file]->new_version : null,
		];
	}
	$core = get_core_updates();
	$core = ($core && $core[0]->response === 'upgrade') ? $core[0]->current : null;

	// PHP errors in the last 24 h: debug.log lines look like "[09-Oct-2026 08:00:00 UTC] PHP Fatal error: ...".
	$errors = 0;
	$log = WP_CONTENT_DIR . '/debug.log';
	if (is_readable($log)) {
		// ponytail: reads the whole log; tail it if a real site's debug.log grows past a few MB
		foreach (file($log) as $line) {
			if (preg_match('/^\[([^\]]+)\] PHP (Fatal|Parse|Warning)/', $line, $m) && strtotime($m[1]) > time() - DAY_IN_SECONDS) $errors++;
		}
	}

	$bytes = 0;
	foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(wp_upload_dir()['basedir'], FilesystemIterator::SKIP_DOTS)) as $f) $bytes += $f->getSize();

	$backup = get_option('bayview_last_backup_at');
	return [
		'wp_version'       => get_bloginfo('version'),
		'php_version'      => PHP_VERSION,
		'plugins'          => $plugins,
		'theme_updates'    => count(get_site_transient('update_themes')->response ?? []),
		'core_update'      => $core,
		'debug_errors_24h' => $errors,
		'last_backup_at'   => $backup ? gmdate('c', (int) $backup) : null,
		'disk_uploads_mb'  => round($bytes / 1048576, 1),
	];
}
