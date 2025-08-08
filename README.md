# Simulador de Batalla 3D

Este prototipo permite enfrentar dos ejércitos sobre un terreno generado de forma procedural. Cada bando puede incluir guerreros, arqueros y magos con comportamientos básicos de IA. El motor gráfico está construido con [Three.js](https://threejs.org/) y se ejecuta completamente en el navegador.

## Requisitos

- [Node.js](https://nodejs.org/) y npm.
- Navegador moderno con soporte WebGL (Chrome, Firefox, Edge, etc.).

## Uso

1. Clona este repositorio e instala las dependencias:

   ```bash
   npm install
   ```

2. Inicia el servidor de desarrollo de Vite:

   ```bash
   npm run dev
   ```

   Abre en tu navegador `http://localhost:5173/batalla-npc.html`.
3. En la pantalla **Configuración de batalla** ajusta la cantidad de unidades por equipo, la semilla procedural y la velocidad inicial de la simulación.
4. Pulsa **Iniciar batalla** para comenzar o usa **Escaramuza rápida (5v5)** para un combate predeterminado.

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

1. `npm install`
2. `npm run dev`
3. Abre `http://localhost:5173/batalla-npc.html`
4. Configura las unidades deseadas o usa la escaramuza rápida.
5. Interactúa con los controles para gestionar la simulación y observar el resultado del combate.
