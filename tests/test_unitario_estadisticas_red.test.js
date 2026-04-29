jest.mock('axios', () => ({
	get: jest.fn()
}));

jest.mock('../utils/middleware-bd', () => ({
	query: jest.fn()
}));

jest.mock('../controllers/youtubeController', () => ({
	getAccessTokenVigente: jest.fn()
}));

const axios = require('axios');
const db = require('../utils/middleware-bd');
const { getAccessTokenVigente } = require('../controllers/youtubeController');
const {
	cargarEstadisticasYoutube,
	obtenerEstadisticasYoutubeApi
} = require('../controllers/estadisticasRedController');

const mockRes = () => {
	const res = {};
	res.status = jest.fn().mockReturnValue(res);
	res.json = jest.fn().mockReturnValue(res);
	return res;
};

describe('Pruebas Unitarias - Estadisticas numericas por red', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('convierte a numero suscriptores, vistas, likes y comentarios por cada video', async () => {
		const req = { session: {} };

		getAccessTokenVigente.mockResolvedValue({
			ok: true,
			accessToken: 'token-valido'
		});

		axios.get.mockImplementation((url) => {
			if (url.includes('/channels')) {
				return Promise.resolve({
					data: {
						items: [{
							snippet: {
								title: 'Canal Prueba',
								thumbnails: {
									high: { url: 'https://img.test/canal.jpg' }
								}
							},
							statistics: {
								subscriberCount: '1520',
								viewCount: '88888'
							},
							contentDetails: {
								relatedPlaylists: {
									uploads: 'PLAYLIST_UPLOADS'
								}
							}
						}]
					}
				});
			}

			if (url.includes('/playlistItems')) {
				return Promise.resolve({
					data: {
						items: [
							{ contentDetails: { videoId: 'video-1' } },
							{ contentDetails: { videoId: 'video-2' } }
						]
					}
				});
			}

			if (url.includes('/videos')) {
				return Promise.resolve({
					data: {
						items: [
							{
								id: 'video-1',
								snippet: {
									title: 'Video 1',
									publishedAt: '2026-01-10T10:00:00Z',
									thumbnails: {
										high: { url: 'https://img.test/video1.jpg' }
									}
								},
								statistics: {
									viewCount: '230',
									likeCount: '31',
									commentCount: '4'
								}
							},
							{
								id: 'video-2',
								snippet: {
									title: 'Video 2',
									publishedAt: '2026-01-11T10:00:00Z',
									thumbnails: {
										high: { url: 'https://img.test/video2.jpg' }
									}
								},
								statistics: {
									viewCount: '540',
									likeCount: '60',
									commentCount: '8'
								}
							}
						]
					}
				});
			}

			return Promise.reject(new Error(`URL inesperada: ${url}`));
		});

		const resultado = await cargarEstadisticasYoutube(req, 'test@correo.com');

		expect(resultado.ok).toBe(true);
		expect(resultado.redes).toHaveLength(2);
		expect(resultado.redes[0]).toMatchObject({
			plataforma: 'YouTube',
			usuario: 'Canal Prueba',
			suscriptores: 1520,
			vistas: 230,
			likes: 31,
			comentarios: 4
		});
		expect(typeof resultado.redes[0].suscriptores).toBe('number');
		expect(typeof resultado.redes[0].vistas).toBe('number');
		expect(typeof resultado.redes[0].likes).toBe('number');
		expect(typeof resultado.redes[0].comentarios).toBe('number');
	});

	test('normaliza valores numericos invalidos a 0 en estadisticas por red', async () => {
		const req = { session: {} };

		getAccessTokenVigente.mockResolvedValue({
			ok: true,
			accessToken: 'token-valido'
		});

		axios.get.mockImplementation((url) => {
			if (url.includes('/channels')) {
				return Promise.resolve({
					data: {
						items: [{
							snippet: {
								title: 'Canal Invalido'
							},
							statistics: {
								subscriberCount: 'abc',
								viewCount: '1000'
							},
							contentDetails: {
								relatedPlaylists: {
									uploads: 'PLAYLIST_UPLOADS'
								}
							}
						}]
					}
				});
			}

			if (url.includes('/playlistItems')) {
				return Promise.resolve({
					data: {
						items: [
							{ contentDetails: { videoId: 'video-invalido' } }
						]
					}
				});
			}

			if (url.includes('/videos')) {
				return Promise.resolve({
					data: {
						items: [{
							id: 'video-invalido',
							snippet: {
								title: 'Video invalido'
							},
							statistics: {
								viewCount: null,
								likeCount: undefined,
								commentCount: 'NaN'
							}
						}]
					}
				});
			}

			return Promise.reject(new Error(`URL inesperada: ${url}`));
		});

		const resultado = await cargarEstadisticasYoutube(req, 'test@correo.com');

		expect(resultado.ok).toBe(true);
		expect(resultado.redes).toHaveLength(1);
		expect(resultado.redes[0]).toMatchObject({
			suscriptores: 0,
			vistas: 0,
			likes: 0,
			comentarios: 0
		});
	});

	test('cuando no hay videos usa estadisticas del canal y conserva campos numericos', async () => {
		const req = { session: {} };

		getAccessTokenVigente.mockResolvedValue({
			ok: true,
			accessToken: 'token-valido'
		});

		axios.get.mockImplementation((url) => {
			if (url.includes('/channels')) {
				return Promise.resolve({
					data: {
						items: [{
							snippet: {
								title: 'Canal sin videos',
								thumbnails: {
									default: { url: 'https://img.test/canal-default.jpg' }
								}
							},
							statistics: {
								subscriberCount: '300',
								viewCount: '1200'
							},
							contentDetails: {
								relatedPlaylists: {
									uploads: 'PLAYLIST_VACIA'
								}
							}
						}]
					}
				});
			}

			if (url.includes('/playlistItems')) {
				return Promise.resolve({
					data: {
						items: []
					}
				});
			}

			return Promise.reject(new Error(`URL inesperada: ${url}`));
		});

		const resultado = await cargarEstadisticasYoutube(req, 'test@correo.com');

		expect(resultado.ok).toBe(true);
		expect(resultado.redes).toHaveLength(1);
		expect(resultado.redes[0]).toMatchObject({
			plataforma: 'YouTube',
			titulo: 'Canal sin videos',
			suscriptores: 300,
			vistas: 1200,
			likes: 0,
			comentarios: 0
		});
		expect(typeof resultado.redes[0].suscriptores).toBe('number');
		expect(typeof resultado.redes[0].vistas).toBe('number');
		expect(typeof resultado.redes[0].likes).toBe('number');
		expect(typeof resultado.redes[0].comentarios).toBe('number');
	});

	test('la API devuelve estadisticas numericas por red cuando hay sesion activa', async () => {
		const req = {
			session: {
				isLoggedIn: true,
				correo: 'test@correo.com'
			}
		};
		const res = mockRes();

		getAccessTokenVigente.mockResolvedValue({
			ok: true,
			accessToken: 'token-valido'
		});

		axios.get.mockImplementation((url) => {
			if (url.includes('/channels')) {
				return Promise.resolve({
					data: {
						items: [{
							snippet: { title: 'Canal API' },
							statistics: {
								subscriberCount: '77',
								viewCount: '1000'
							},
							contentDetails: {
								relatedPlaylists: {
									uploads: 'PLAYLIST_API'
								}
							}
						}]
					}
				});
			}

			if (url.includes('/playlistItems')) {
				return Promise.resolve({
					data: {
						items: [{ contentDetails: { videoId: 'video-api' } }]
					}
				});
			}

			if (url.includes('/videos')) {
				return Promise.resolve({
					data: {
						items: [{
							snippet: { title: 'Video API' },
							statistics: {
								viewCount: '45',
								likeCount: '6',
								commentCount: '2'
							}
						}]
					}
				});
			}

			return Promise.reject(new Error(`URL inesperada: ${url}`));
		});

		db.query.mockResolvedValue([{ existe: 1 }]);

		await obtenerEstadisticasYoutubeApi(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			ok: true,
			redes: [
				expect.objectContaining({
					suscriptores: 77,
					vistas: 45,
					likes: 6,
					comentarios: 2
				})
			]
		});
	});

	test('si falla obtener token vigente devuelve error y status de token', async () => {
		getAccessTokenVigente.mockResolvedValue({
			ok: false,
			error: 'Token vencido',
			status: 401
		});

		const resultado = await cargarEstadisticasYoutube({ session: {} }, 'test@correo.com');

		expect(resultado).toEqual({
			ok: false,
			error: 'Token vencido',
			status: 401
		});
		expect(axios.get).not.toHaveBeenCalled();
	});

	test('si no existe canal en YouTube devuelve redes vacias', async () => {
		getAccessTokenVigente.mockResolvedValue({
			ok: true,
			accessToken: 'token-valido'
		});

		axios.get.mockResolvedValue({
			data: {
				items: []
			}
		});

		const resultado = await cargarEstadisticasYoutube({ session: {} }, 'test@correo.com');

		expect(resultado).toEqual({
			ok: true,
			redes: []
		});
		expect(axios.get).toHaveBeenCalledTimes(1);
	});

	test('si hay varios pageToken y mas de 50 videos hace paginacion y lotes', async () => {
		const req = { session: {} };

		getAccessTokenVigente.mockResolvedValue({
			ok: true,
			accessToken: 'token-valido'
		});

		const ids = Array.from({ length: 51 }, (_, index) => `video-${index + 1}`);
		axios.get.mockImplementation((url, config = {}) => {
			if (url.includes('/channels')) {
				return Promise.resolve({
					data: {
						items: [{
							snippet: { title: 'Canal Paginado' },
							statistics: { subscriberCount: '10' },
							contentDetails: {
								relatedPlaylists: { uploads: 'PLAYLIST_PAGINADA' }
							}
						}]
					}
				});
			}

			if (url.includes('/playlistItems')) {
				if (!config.params?.pageToken) {
					return Promise.resolve({
						data: {
							items: ids.slice(0, 50).map((videoId) => ({ contentDetails: { videoId } })),
							nextPageToken: 'NEXT_PAGE'
						}
					});
				}

				return Promise.resolve({
					data: {
						items: ids.slice(50).map((videoId) => ({ contentDetails: { videoId } }))
					}
				});
			}

			if (url.includes('/videos')) {
				const requestedIds = String(config.params?.id || '').split(',').filter(Boolean);
				return Promise.resolve({
					data: {
						items: requestedIds.map((id) => ({
							snippet: { title: id },
							statistics: { viewCount: '1', likeCount: '2', commentCount: '3' }
						}))
					}
				});
			}

			return Promise.reject(new Error(`URL inesperada: ${url}`));
		});

		const resultado = await cargarEstadisticasYoutube(req, 'test@correo.com');

		expect(resultado.ok).toBe(true);
		expect(resultado.redes).toHaveLength(51);
		const llamadasPlaylist = axios.get.mock.calls.filter(([url]) => url.includes('/playlistItems'));
		const llamadasVideos = axios.get.mock.calls.filter(([url]) => url.includes('/videos'));
		expect(llamadasPlaylist).toHaveLength(2);
		expect(llamadasVideos).toHaveLength(2);
	});

	test('API responde 401 si no hay sesion iniciada', async () => {
		const req = {
			session: {
				isLoggedIn: false,
				correo: 'test@correo.com'
			}
		};
		const res = mockRes();

		await obtenerEstadisticasYoutubeApi(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({
			ok: false,
			error: 'Debes iniciar sesion para continuar'
		});
		expect(db.query).not.toHaveBeenCalled();
	});

	test('API responde redes vacias cuando el usuario no tiene vinculacion', async () => {
		const req = {
			session: {
				isLoggedIn: true,
				correo: 'test@correo.com'
			}
		};
		const res = mockRes();
		db.query.mockResolvedValue([]);

		await obtenerEstadisticasYoutubeApi(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			ok: true,
			redes: []
		});
	});

	test('API propaga status y error cuando cargarEstadisticasYoutube falla', async () => {
		const req = {
			session: {
				isLoggedIn: true,
				correo: 'test@correo.com'
			}
		};
		const res = mockRes();
		db.query.mockResolvedValue([{ existe: 1 }]);

		getAccessTokenVigente.mockResolvedValue({
			ok: false,
			error: 'Refresh token invalido',
			status: 403
		});

		await obtenerEstadisticasYoutubeApi(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).toHaveBeenCalledWith({
			ok: false,
			error: 'Refresh token invalido'
		});
	});
});
