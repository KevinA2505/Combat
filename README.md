# Simulador de Batalla 3D

Este prototipo permite enfrentar dos ejércitos sobre un terreno generado de forma procedural. Cada bando puede incluir guerreros, arqueros y magos con comportamientos básicos de IA. El motor gráfico está construido con [Three.js](https://threejs.org/) y se ejecuta completamente en el navegador.

## Requisitos

- Navegador moderno con soporte WebGL (Chrome, Firefox, Edge, etc.).
- No requiere instalación adicional: las dependencias se cargan desde CDNs.

## Uso

1. Clona este repositorio y abre `batalla-npc.html` en tu navegador. Se recomienda iniciar un servidor local:

   ```bash
   python3 -m http.server
   ```

   Luego visita `http://localhost:8000/batalla-npc.html`.
2. En la pantalla **Configuración de batalla** ajusta la cantidad de unidades por equipo, la semilla procedural y la velocidad inicial de la simulación.
3. Pulsa **Iniciar batalla** para comenzar o usa **Escaramuza rápida (5v5)** para un combate predeterminado.

### Controles durante la simulación

- **Pausar / Reanudar**, **Reiniciar** y **Recentrar cámara** mediante el panel de control.
- Control deslizante de **Velocidad** para acelerar o ralentizar el tiempo de juego.
- Panel de **Estadísticas** con el número de unidades vivas y el estado de la batalla.

## Opciones principales de la interfaz

- Configuración de ejércitos para los equipos A y B.
- Ajuste de semilla procedural y velocidad antes de iniciar.
- Botón de escaramuza rápida con composición predeterminada.
- Durante la partida: controles de pausa, reinicio, cámara y ajuste de velocidad.
- Estadísticas en tiempo real de unidades supervivientes y del ganador.

## Inicio rápido

1. Ejecuta un servidor local y abre `batalla-npc.html`.
2. Configura las unidades deseadas o usa la escaramuza rápida.
3. Interactúa con los controles para gestionar la simulación y observar el resultado del combate.
