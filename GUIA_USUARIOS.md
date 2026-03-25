# GUÍA DE GESTIÓN DE USUARIOS CON SESIONES - NexusHub

## ✅ ¿Qué se ha implementado?

### 1. **Sistema de Autenticación Completo**
- ✓ Registro de usuarios con validación segura
- ✓ Login con contraseña encriptada (bcrypt)
- ✓ Sesiones persistentes en base de datos (MySQL Store)
- ✓ Logout con destrucción de sesión
- ✓ Middleware de autenticación para proteger rutas

### 2. **Gestión de Sesiones**
- ✓ Las sesiones se almacenan en la BD MySQL
- ✓ Duración: **1 hora** (3.600.000 ms)
- ✓ Verificación automática cada 10 minutos
- ✓ Al cerrar el navegador o al vencer el tiempo, se destruye la sesión

### 3. **Protección de Rutas**
| Ruta | Acceso | Función |
|------|--------|---------|
| `/` | Público | Página principal |
| `/bienvenida` | **Solo autenticados** | Dashboard de usuario |
| `/usuario/registro` | **Solo no autenticados** | Formulario de registro |
| `/usuario/inicio-sesion` | **Solo no autenticados** | Formulario de login |
| `/usuario/ver-usuarios` | **Cualquiera** | Lista de usuarios |
| `/usuario/logout` | **Solo autenticados** | Cerrar sesión |

### 4. **Datos de Sesión Persistentes**
Los siguientes datos se mantienen en la sesión:
```javascript
req.session.usuarioId    // ID del usuario
req.session.correo       // Email del usuario
req.session.isLoggedIn   // Estado de autenticación
```

Disponibles en todas las vistas como:
```ejs
<%= user %>           // ID del usuario
<%= correo %>         // Email del usuario
<%= isLoggedIn %>     // true/false
```

---

## 🚀 CÓMO USAR

### **Para Registrar un Usuario Nuevo:**
1. Ir a `/usuario/registro`
2. Rellenar:
   - **Correo**: Email válido
   - **Contraseña**: Mín. 8 caracteres, 1 mayúscula, 1 número, 1 símbolo
   - **Confirmar contraseña**: Debe coincidir
3. Clic en "Registrarse"
4. Si es exitoso → Redirige a login

### **Para Iniciar Sesión:**
1. Ir a `/usuario/inicio-sesion`
2. Rellenar correo y contraseña
3. Clic en "Entrar a NexusHub"
4. Si es correcto → Redirige a `/bienvenida`
5. La sesión se mantiene activa durante 1 hora

### **Para Cerrar Sesión:**
1. Navío → Menú desplegable (icono usuario)
2. Clic en "Cerrar sesión"
3. Se destruye la sesión y redirige a login

---

## 🔐 Características de Seguridad

✓ **Contraseñas encriptadas** con bcrypt (10 salt rounds)  
✓ **Validación de email** con validator.js  
✓ **Sesiones seguras** almacenadas en BD (no en cookies)  
✓ **Prevención de acceso no autorizado** con middleware  
✓ **Cookies de sesión** con maxAge de 1 hora  

---

## 🗂️ Archivos Modificados/Creados

### **Creados:**
- `utils/middleware-auth.js` - Middleware de autenticación

### **Modificados:**
- `app.js` - Configuración de sesiones y rutas principales
- `controllers/usuarioController.js` - Función logout agregada
- `routers/router_usuario.js` - Rutas protegidas
- `views/fragments/navbar.ejs` - Navbar dinámico
- `views/bienvenida.ejs` - Dashboard personalizado

---

## 📊 Base de Datos - Estructura de Sesiones

La tabla `sessions` se crea automáticamente en MySQL con:
```sql
CREATE TABLE sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires INT(11) UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  KEY `expires` (`expires`)
);
```

---

## ⚙️ Configuración de Sesión

```javascript
// En app.js
session({
    store: sessionStore,              // Almacenamiento en BD
    secret: "inicio_sesion_es_seguro", // Clave secreta
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,                // true en HTTPS
        maxAge: 3600000               // 1 hora en ms
    }
})
```

---

## 🧪 Cómo Probar

### Prueba 1: Registro e Inicio de Sesión
```bash
1. Ir a http://localhost:3000/usuario/registro
2. Crear una cuenta
3. Ir a http://localhost:3000/usuario/inicio-sesion
4. Iniciar sesión con la cuenta creada
5. Deberías ver el dashboard en /bienvenida
```

### Prueba 2: Protección de Rutas
```bash
1. Sin iniciar sesión, intenta acceder a /bienvenida
   → Te redirige a login automáticamente
2. Intenta acceder a /usuario/registro estando logueado
   → Te redirige a /bienvenida automáticamente
```

### Prueba 3: Logout
```bash
1. Estando logueado, haz clic en "Cerrar sesión"
2. Intenta acceder directamente a /bienvenida
   → Deberías ser redirigido a login
```

### Prueba 4: Persistencia de Sesión
```bash
1. Inicia sesión
2. Recarga la página → Deberías seguir logueado
3. Cierra el navegador y vuelve a abrir
   → Mientras no haya pasado 1 hora, seguirás logueado
```

---

## 🐛 Solución de Problemas

### La sesión no persiste
- Verifica que MySQL Store está correctamente conectado
- Revisa el log de conexión a BD
- Asegúrate de que la tabla `sessions` existe

### Error al registrar
- Valida que el correo sea único y válido
- La contraseña debe cumplir los requisitos
- Revisa la consola para errores en BD

### Botón logout no funciona
- Asegúrate de tener `bootstrap.bundle.js` en head.ejs
- Verifica que el onclick="logout()" está en el HTML

---

## 📝 Próximas Mejoras Sugeridas

1. **Recuperación de contraseña** - Envío de email
2. **Editar perfil** - Actualizar datos de usuario
3. **Autenticación de 2 factores**
4. **Remember me** - Mantener sesión más tiempo
5. **Roles y permisos** - Admin vs Usuario regular
6. **Cambio de contraseña** - Para usuarios autenticados

---

¡Sistema de autenticación listo para usar! 🎉
