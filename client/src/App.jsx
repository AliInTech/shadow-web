import React from 'react';
import Chat from './components/Chat';

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🌑 Shadow Web</h1>
        <p>Decentralized P2P Communication Platform</p>
      </header>
      
      <main className="app-content">
        {/* Swapping placeholder with real-time chat infrastructure */}
        <Chat />
      </main>
    </div>
  );
}

export default App;
