<?php
/**
 * Class Google\Site_Kit\Modules\Site_Verification
 *
 * @package   Google\Site_Kit
 * @copyright 2019 Google LLC
 * @license   https://www.apache.org/licenses/LICENSE-2.0 Apache License 2.0
 * @link      https://sitekit.withgoogle.com
 */

namespace Google\Site_Kit\Modules;

use Google\Site_Kit\Core\Authentication\Verification_File;
use Google\Site_Kit\Core\Modules\Module;
use Google\Site_Kit\Core\Modules\Module_With_Scopes;
use Google\Site_Kit\Core\Modules\Module_With_Scopes_Trait;
use Google\Site_Kit\Core\Permissions\Permissions;
use Google\Site_Kit\Core\REST_API\Data_Request;
use Google\Site_Kit\Core\Util\Exit_Handler;
use Google\Site_Kit_Dependencies\Google_Client;
use Google\Site_Kit_Dependencies\Google_Service_Exception;
use Google\Site_Kit_Dependencies\Google_Service_SiteVerification;
use Google\Site_Kit_Dependencies\Google_Service_SiteVerification_SiteVerificationWebResourceGettokenRequest;
use Google\Site_Kit_Dependencies\Google_Service_SiteVerification_SiteVerificationWebResourceGettokenRequestSite;
use Google\Site_Kit_Dependencies\Google_Service_SiteVerification_SiteVerificationWebResourceResource;
use Google\Site_Kit_Dependencies\Google_Service_SiteVerification_SiteVerificationWebResourceResourceSite;
use Google\Site_Kit_Dependencies\Psr\Http\Message\RequestInterface;
use WP_Error;
use Exception;

/**
 * Class representing the Site Verification module.
 *
 * @since 1.0.0
 * @access private
 * @ignore
 */
final class Site_Verification extends Module implements Module_With_Scopes {
	use Module_With_Scopes_Trait;

	/**
	 * Meta site verification type.
	 */
	const VERIFICATION_TYPE_META = 'META';

	/**
	 * File site verification type.
	 */
	const VERIFICATION_TYPE_FILE = 'FILE';

	/**
	 * Registers functionality through WordPress hooks.
	 *
	 * @since 1.0.0
	 */
	public function register() {
		$this->register_scopes_hook();

		add_action(
			'admin_init',
			function() {
				$this->handle_verification_token();
			}
		);

		$print_site_verification_meta = function() {
			$this->print_site_verification_meta();
		};

		add_action( 'wp_head', $print_site_verification_meta );
		add_action( 'login_head', $print_site_verification_meta );

		add_action(
			'init',
			function () {
				if (
					isset( $_SERVER['REQUEST_URI'], $_SERVER['REQUEST_METHOD'] )
					&& 'GET' === strtoupper( $_SERVER['REQUEST_METHOD'] )
					&& preg_match( '/^\/google(?P<token>[a-z0-9]+)\.html$/', $_SERVER['REQUEST_URI'], $matches )
				) {
					$this->serve_verification_file( $matches['token'] );
				}
			}
		);

	}

	/**
	 * Gets required Google OAuth scopes for the module.
	 *
	 * @since 1.0.0
	 *
	 * @return array List of Google OAuth scopes.
	 */
	public function get_scopes() {
		return array(
			'https://www.googleapis.com/auth/siteverification',
		);
	}

	/**
	 * Returns the mapping between available datapoints and their services.
	 *
	 * @since 1.0.0
	 *
	 * @return array Associative array of $datapoint => $service_identifier pairs.
	 */
	protected function get_datapoint_services() {
		return array(
			// GET / POST.
			'verification'       => 'siteverification',
			// GET.
			'verification-token' => 'siteverification',
			'verified-sites'     => 'siteverification',
		);
	}

	/**
	 * Creates a request object for the given datapoint.
	 *
	 * @since 1.0.0
	 *
	 * @param Data_Request $data Data request object.
	 *
	 * @return RequestInterface|callable|WP_Error Request object or callable on success, or WP_Error on failure.
	 */
	protected function create_data_request( Data_Request $data ) {
		$method    = $data->method;
		$datapoint = $data->datapoint;

		if ( 'GET' === $method ) {
			switch ( $datapoint ) {
				case 'verified-sites':
					return $this->get_siteverification_service()->webResource->listWebResource();
				case 'verification':
					return $this->get_siteverification_service()->webResource->listWebResource();
				case 'verification-token':
					$existing_token = $this->authentication->verification_meta()->get();

					if ( ! empty( $existing_token ) ) {
						return function() use ( $existing_token ) {
							return array(
								'method' => 'META',
								'token'  => $existing_token,
							);
						};
					}

					$current_url = ! empty( $data['siteURL'] ) ? $data['siteURL'] : $this->context->get_reference_site_url();
					$site        = new Google_Service_SiteVerification_SiteVerificationWebResourceGettokenRequestSite();
					$site->setIdentifier( $current_url );
					$site->setType( 'SITE' );
					$request = new Google_Service_SiteVerification_SiteVerificationWebResourceGettokenRequest();
					$request->setSite( $site );
					$request->setVerificationMethod( 'META' );

					return $this->get_siteverification_service()->webResource->getToken( $request );
			}
		} elseif ( 'POST' === $method ) {
			switch ( $datapoint ) {
				case 'verification':
					if ( ! isset( $data['siteURL'] ) ) {
						/* translators: %s: Missing parameter name */
						return new WP_Error( 'missing_required_param', sprintf( __( 'Request parameter is empty: %s.', 'google-site-kit' ), 'siteURL' ), array( 'status' => 400 ) );
					}

					return function() use ( $data ) {
						$current_user = wp_get_current_user();

						if ( ! $current_user || ! $current_user->exists() ) {
							return new WP_Error( 'unknown_user', __( 'Unknown user.', 'google-site-kit' ) );
						}

						$site = $this->get_data( 'verification', $data );

						if ( is_wp_error( $site ) ) {
							return $site;
						}

						$sites = array();

						if ( ! empty( $site['verified'] ) ) {
							$this->authentication->verification()->set( true );

							return $site;
						} else {
							$token = $this->get_data( 'verification-token', $data );

							if ( is_wp_error( $token ) ) {
								return $token;
							}

							$this->authentication->verification_meta()->set( $token['token'] );

							$client     = $this->get_client();
							$orig_defer = $client->shouldDefer();
							$client->setDefer( false );
							$errors = new WP_Error();

							foreach ( $this->permute_site_url( $data['siteURL'] ) as $url ) {
								$site = new Google_Service_SiteVerification_SiteVerificationWebResourceResourceSite();
								$site->setType( 'SITE' );
								$site->setIdentifier( $url );
								$resource = new Google_Service_SiteVerification_SiteVerificationWebResourceResource();
								$resource->setSite( $site );

								try {
									$sites[] = $this->get_siteverification_service()->webResource->insert( 'META', $resource );
								} catch ( Google_Service_Exception $e ) {
									$messages = wp_list_pluck( $e->getErrors(), 'message' );
									$message  = array_shift( $messages );

									$errors->add( $e->getCode(), $message, array( 'url' => $url ) );
								} catch ( Exception $e ) {
									$errors->add( $e->getCode(), $e->getMessage(), array( 'url' => $url ) );
								}
							}

							$client->setDefer( $orig_defer );

							if ( empty( $sites ) ) {
								return $errors;
							}
						}

						$this->authentication->verification()->set( true );

						try {
							$verification = $this->get_siteverification_service()->webResource->get( $data['siteURL'] );
						} catch ( Google_Service_Exception $e ) {
							$verification = array_shift( $sites );
						}

						return array(
							'identifier' => $verification->getSite()->getIdentifier(),
							'type'       => $verification->getSite()->getType(),
							'verified'   => true,
						);
					};
			}
		}

		return new WP_Error( 'invalid_datapoint', __( 'Invalid datapoint.', 'google-site-kit' ) );
	}

	/**
	 * Parses a response for the given datapoint.
	 *
	 * @since 1.0.0
	 *
	 * @param Data_Request $data Data request object.
	 * @param mixed        $response Request response.
	 *
	 * @return mixed Parsed response data on success, or WP_Error on failure.
	 */
	protected function parse_data_response( Data_Request $data, $response ) {
		$method    = $data->method;
		$datapoint = $data->datapoint;

		if ( 'GET' === $method ) {
			switch ( $datapoint ) {
				case 'verified-sites':
					$items = $response->getItems();
					$data  = array();

					foreach ( $items as $item ) {
						$site                   = $item->getSite();
						$data[ $item->getId() ] = array(
							'identifier' => $site->getIdentifier(),
							'type'       => $site->getType(),
						);
					}

					return $data;
				case 'verification':
					if ( $data['siteURL'] ) {
						$current_url = trailingslashit( $data['siteURL'] );
					} else {
						$current_url = trailingslashit( $this->context->get_reference_site_url() );
					}

					$items = $response->getItems();

					foreach ( $items as $item ) {
						$site = $item->getSite();
						$url  = trailingslashit( $site->getIdentifier() );

						if ( 'SITE' === $site->getType() && $current_url === $url ) {
							return array(
								'identifier' => $site->getIdentifier(),
								'type'       => $site->getType(),
								'verified'   => true,
							);
						}

						if ( 'INET_DOMAIN' === $site->getType() ) {
							$host = str_replace( array( 'http://', 'https://' ), '', $site->getIdentifier() );

							if ( ! empty( $host ) && false !== strpos( trailingslashit( $current_url ), trailingslashit( $host ) ) ) {
								$response = array(
									'identifier' => $site->getIdentifier(),
									'type'       => $site->getType(),
									'verified'   => true,
								);

								return $response;
							}
						}
					}

					return array(
						'identifier' => $current_url,
						'type'       => 'SITE',
						'verified'   => false,
					);
				case 'verification-token':
					if ( is_array( $response ) ) {
						return $response;
					}

					return array(
						'method' => $response->getMethod(),
						'token'  => $response->getToken(),
					);
			}
		}

		return $response;
	}

	/**
	 * Sets up information about the module.
	 *
	 * @since 1.0.0
	 *
	 * @return array Associative array of module info.
	 */
	protected function setup_info() {
		return array(
			'slug'         => 'site-verification',
			'name'         => __( 'Site Verification', 'google-site-kit' ),
			'description'  => __( 'Google Site Verification allows you to manage ownership of your site.', 'google-site-kit' ),
			'cta'          => __( 'Verify ownership with Google Site Verification.', 'google-site-kit' ),
			'order'        => 0,
			'homepage'     => __( 'https://www.google.com/webmasters/verification/home', 'google-site-kit' ),
			'learn_more'   => __( 'https://developers.google.com/site-verification/', 'google-site-kit' ),
			'force_active' => true,
			'internal'     => true,
		);
	}

	/**
	 * Get the configured siteverification service instance.
	 *
	 * @return Google_Service_SiteVerification The Site Verification API service.
	 */
	private function get_siteverification_service() {
		return $this->get_service( 'siteverification' );
	}

	/**
	 * Sets up the Google services the module should use.
	 *
	 * This method is invoked once by {@see Module::get_service()} to lazily set up the services when one is requested
	 * for the first time.
	 *
	 * @since 1.0.0
	 *
	 * @param Google_Client $client Google client instance.
	 * @return array Google services as $identifier => $service_instance pairs. Every $service_instance must be an
	 *               instance of Google_Service.
	 */
	protected function setup_services( Google_Client $client ) {
		return array(
			'siteverification' => new Google_Service_SiteVerification( $client ),
		);
	}

	/**
	 * Handles receiving a verification token for a user by the authentication proxy.
	 *
	 * @since 1.1.0
	 */
	private function handle_verification_token() {
		$authentication = $this->authentication;
		$auth_client    = $authentication->get_oauth_client();

		$verification_token = filter_input( INPUT_GET, 'googlesitekit_verification_token' );
		if ( empty( $verification_token ) ) {
			return;
		}

		$verification_nonce = filter_input( INPUT_GET, 'googlesitekit_verification_nonce' );
		if ( empty( $verification_nonce ) || ! wp_verify_nonce( $verification_nonce, 'googlesitekit_verification' ) ) {
			wp_die( esc_html__( 'Invalid nonce.', 'google-site-kit' ) );
		}

		$verification_type = filter_input( INPUT_GET, 'googlesitekit_verification_token_type' ) ?: self::VERIFICATION_TYPE_META;
		switch ( $verification_type ) {
			case self::VERIFICATION_TYPE_FILE:
				$authentication->verification_file()->set( $verification_token );
				break;
			case self::VERIFICATION_TYPE_META:
				$authentication->verification_meta()->set( $verification_token );
		}

		wp_safe_redirect(
			add_query_arg(
				array(
					'verify'              => 'true',
					'verification_method' => $verification_type,
				),
				// We need to pass the 'missing_verification' error code here so that the URL includes a verification nonce.
				$auth_client->get_proxy_setup_url(
					filter_input( INPUT_GET, 'googlesitekit_code' ),
					'missing_verification'
				)
			)
		);
		exit;
	}

	/**
	 * Prints site verification meta in wp_head().
	 *
	 * @since 1.1.0
	 */
	private function print_site_verification_meta() {
		// Get verification meta tags for all users.
		$verification_tags = $this->authentication->verification_meta()->get_all();
		$allowed_html      = array(
			'meta' => array(
				'name'    => array(),
				'content' => array(),
			),
		);

		foreach ( $verification_tags as $verification_tag ) {
			$verification_tag = html_entity_decode( $verification_tag );

			if ( 0 !== strpos( $verification_tag, '<meta ' ) ) {
				$verification_tag = '<meta name="google-site-verification" content="' . esc_attr( $verification_tag ) . '">';
			}

			echo wp_kses( $verification_tag, $allowed_html );
		}
	}

	/**
	 * Serves the verification file response.
	 *
	 * @param string $verification_token Token portion of verification.
	 *
	 * @since 1.1.0
	 */
	private function serve_verification_file( $verification_token ) {
		global $wpdb;

		// User option keys are prefixed in single site and multisite when not in network mode.
		$key_prefix = $this->context->is_network_mode() ? '' : $wpdb->get_blog_prefix();
		$user_ids   = ( new \WP_User_Query(
			array(
				'meta_key'   => $key_prefix . Verification_File::OPTION,
				'meta_value' => $verification_token,
				'fields'     => 'id',
				'number'     => 1,
			)
		) )->get_results();

		$user_id = array_shift( $user_ids ) ?: 0;

		if ( $user_id && user_can( $user_id, Permissions::SETUP ) ) {
			printf( 'google-site-verification: google%s.html', esc_html( $verification_token ) );
			( new Exit_Handler() )->invoke();
		}

		// If the user does not have the necessary permissions then let the request pass through.
	}
}
