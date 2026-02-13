// Signaling Server for Screen Sharing App
// Install dependencies: npm install express socket.io cors

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const cors = require('cors');

app.use(cors());
app.use(express.static('public'));

// Store active sessions
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Host creates a session
  socket.on('create-session', (sessionId) => {
    console.log('Session created:', sessionId, 'by', socket.id);
    
    socket.join(sessionId);
    sessions.set(sessionId, {
      hostId: socket.id,
      viewers: []
    });

    socket.emit('session-created', sessionId);
  });

  // Viewer joins a session
  socket.on('join-session', (sessionId) => {
    console.log('User', socket.id, 'joining session:', sessionId);
    
    const session = sessions.get(sessionId);
    
    if (!session) {
      socket.emit('error', 'Session not found');
      return;
    }

    socket.join(sessionId);
    session.viewers.push(socket.id);

    // Notify host about new viewer
    io.to(session.hostId).emit('viewer-joined', {
      viewerId: socket.id,
      viewerCount: session.viewers.length
    });

    // Notify viewer to request offer
    socket.emit('ready-to-connect', session.hostId);
  });

  // WebRTC signaling - offer
  socket.on('offer', (data) => {
    console.log('Offer from', socket.id, 'to', data.to);
    io.to(data.to).emit('offer', {
      from: socket.id,
      offer: data.offer
    });
  });

  // WebRTC signaling - answer
  socket.on('answer', (data) => {
    console.log('Answer from', socket.id, 'to', data.to);
    io.to(data.to).emit('answer', {
      from: socket.id,
      answer: data.answer
    });
  });

  // WebRTC signaling - ICE candidate
  socket.on('ice-candidate', (data) => {
    console.log('ICE candidate from', socket.id, 'to', data.to);
    io.to(data.to).emit('ice-candidate', {
      from: socket.id,
      candidate: data.candidate
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // Check if disconnected user was a host
    for (let [sessionId, session] of sessions.entries()) {
      if (session.hostId === socket.id) {
        // Notify all viewers that host left
        io.to(sessionId).emit('host-left');
        sessions.delete(sessionId);
      } else {
        // Remove from viewers list
        const index = session.viewers.indexOf(socket.id);
        if (index > -1) {
          session.viewers.splice(index, 1);
          // Notify host about viewer count update
          io.to(session.hostId).emit('viewer-count-update', session.viewers.length);
        }
      }
    }
  });

  // Host ends session
  socket.on('end-session', (sessionId) => {
    console.log('Session ended:', sessionId);
    io.to(sessionId).emit('session-ended');
    sessions.delete(sessionId);
  });
});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
