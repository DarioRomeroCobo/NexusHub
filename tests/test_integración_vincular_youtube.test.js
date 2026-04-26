test('GET /usuario/vincular-youtube redirige a login cuando no hay sesión', async () => {
    const response = await request(app).get('/usuario/vincular-youtube');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/usuario/inicio-sesion');
});

test('GET /usuario/vincular-youtube sin sesión devuelve mensaje de redirección', async () => {
    const response = await request(app).get('/usuario/vincular-youtube');

    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toMatch(/redirecting to \/usuario\/inicio-sesion/i);
});

test('GET /usuario/vincular-youtube responde correctamente con sesión activa', async () => {
    const correo = generarCorreoUnico();
    await crearUsuario(correo, 'Valida@123');

    const agent = request.agent(app);

    // Login
    const loginResponse = await agent
        .post('/usuario/api/login')
        .send({ correo, password: 'Valida@123' });

    expect(loginResponse.status).toBe(200);

    // Acceso a la vista
    const response = await agent.get('/usuario/vincular-youtube');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toMatch(/youtube/i);
});

test('GET /usuario/vincular-youtube muestra UI de conexión OAuth con sesión', async () => {
    const correo = generarCorreoUnico();
    await crearUsuario(correo, 'Valida@123');

    const agent = request.agent(app);

    const loginResponse = await agent
        .post('/usuario/api/login')
        .send({ correo, password: 'Valida@123' });

    expect(loginResponse.status).toBe(200);

    const response = await agent.get('/usuario/vincular-youtube');

    expect(response.status).toBe(200);
    expect(response.text).toMatch(/conectar con youtube/i);
    expect(response.text).toMatch(/oauth/i);
});