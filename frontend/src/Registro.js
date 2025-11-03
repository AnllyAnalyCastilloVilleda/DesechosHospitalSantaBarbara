import React, { useEffect, useState } from 'react';
import './App.css';


function Registro() {
  const [usuario, setUsuario] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [rolId, setRolId] = useState('');
  const [roles, setRoles] = useState([]);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    // Cargar roles desde el backend
    fetch('http://localhost:5000/roles')
      .then(res => res.json())
      .then(data => setRoles(data))
      .catch(err => console.error('Error al cargar roles', err));
  }, []);

  const manejarRegistro = async (e) => {
    e.preventDefault();

    if (contrasena !== confirmar) {
      setMensaje('❌ Las contraseñas no coinciden');
      return;
    }

    try {
      const respuesta = await fetch('http://localhost:5000/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, contrasena, telefono, nombre, rol_id: rolId })
      });

      const data = await respuesta.json();

      if (respuesta.ok) {
        setMensaje(`✅ ${data.mensaje}`);
        setUsuario('');
        setTelefono('');
        setNombre('');
        setContrasena('');
        setConfirmar('');
        setRolId('');
      } else {
        setMensaje(`❌ ${data.mensaje}`);
      }
    } catch (error) {
      setMensaje('⚠️ Error al conectar con el servidor');
    }
  };

  return (
    <div className="login-container">
      <h2>Registrar Usuario</h2>
      <form onSubmit={manejarRegistro}>
        <label>Nombre completo</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />

        <label>Nombre de usuario</label>
        <input type="text" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />

        <label>Teléfono</label>
        <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />

        <label>Contraseña</label>
        <input type="password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />

        <label>Confirmar contraseña</label>
        <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />

        <label>Rol</label>
        <select value={rolId} onChange={(e) => setRolId(e.target.value)} required>
          <option value="">Seleccione un rol</option>
          {roles.map((rol) => (
            <option key={rol.id} value={rol.id}>
              {rol.nombre}
            </option>
          ))}
        </select>

        <button type="submit">Registrar</button>
      </form>
      {mensaje && <p>{mensaje}</p>}
    </div>
  );
}

export default Registro;
