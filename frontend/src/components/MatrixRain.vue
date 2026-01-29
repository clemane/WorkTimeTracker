<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationId: number;

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Setting the width and height of the canvas
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener("resize", resize);
  resize();

  // Setting up the letters
  let letters = 'ABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZABCDEFGHIJKLMNOPQRSTUVXYZ';
  const chars = letters.split('');

  // Setting up the columns
  const fontSize = 10;
  // Initialize columns based on initial width
  let columns = canvas.width / fontSize;
  
  // Setting up the drops
  let drops: number[] = [];
  
  // Function to init drops (called on resize too ideally, but for now simple)
  function initDrops() {
    columns = canvas.width / fontSize;
    drops = [];
    for (let i = 0; i < columns; i++) {
      drops[i] = 1;
    }
  }
  initDrops();

  // Handle resize for drops
  window.addEventListener("resize", initDrops);

  // Setting up the draw function
  function draw() {
    // Semi-transparent black to create trail effect
    ctx!.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx!.fillRect(0, 0, canvas.width, canvas.height);

    ctx!.fillStyle = '#0f0'; // Green text
    ctx!.font = fontSize + 'px monospace';

    for (let i = 0; i < drops.length; i++) {
      const text = chars[Math.floor(Math.random() * chars.length)];
      ctx!.fillText(text, i * fontSize, drops[i] * fontSize);

      // Sending the drop back to the top randomly after it has crossed the screen
      // adding a randomness to the reset to make the drops scattered on the Y axis
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }

      // Incrementing Y coordinate
      drops[i]++;
    }
    
    // Slow down the animation slightly simply by using timeout or just let rAF run 60fps
    // The original code used setInterval 33ms (~30fps). 
    // To match that speed with rAF, we can skip frames or just let it fly. 
    // Let's keep it fluid.
    animationId = requestAnimationFrame(draw);
  }

  // Start loop
  draw();

  onUnmounted(() => {
    cancelAnimationFrame(animationId);
    window.removeEventListener("resize", resize);
    window.removeEventListener("resize", initDrops);
  });
});
</script>

<template>
  <canvas ref="canvasRef" class="fixed inset-0 pointer-events-none z-0"></canvas>
</template>
