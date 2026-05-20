import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useTournamentStore } from '../store/useTournamentStore';
import { Button } from './ui/Button';
import { X, Save, ArrowLeft, ArrowRight, SkipBack, SkipForward } from 'lucide-react';

interface PgnViewerModalProps {
  matchId: string;
  onClose: () => void;
}

export function PgnViewerModal({ matchId, onClose }: PgnViewerModalProps) {
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const updateMatchPgn = useTournamentStore(s => s.updateMatchPgn);
  
  const tournament = tournaments?.find(t => t.id === activeId);
  const match = tournament?.matches.find(m => m.id === matchId);
  
  const [pgnText, setPgnText] = useState(match?.pgn || '');
  const [chessInstance] = useState(new Chess());
  const [position, setPosition] = useState(chessInstance.fen());
  const [history, setHistory] = useState<any[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(!match?.pgn);

  useEffect(() => {
    if (match?.pgn && !isEditing) {
      loadPgn(match.pgn);
    }
  }, [match?.pgn, isEditing]);

  const loadPgn = (pgn: string) => {
    try {
      chessInstance.reset();
      chessInstance.loadPgn(pgn);
      const h = chessInstance.history({ verbose: true });
      setHistory(h);
      setCurrentMoveIndex(h.length - 1);
      setPosition(chessInstance.fen());
      setError('');
    } catch (e: any) {
      setError('Invalid PGN format.');
    }
  };

  const handleSave = () => {
    try {
      // Validate before saving by checking if chess.js can load it
      const tempGame = new Chess();
      tempGame.loadPgn(pgnText);
      
      updateMatchPgn(matchId, pgnText);
      setIsEditing(false);
      loadPgn(pgnText);
    } catch {
      setError('Cannot save: Invalid PGN format.');
    }
  };

  const handleMove = (index: number) => {
    chessInstance.reset();
    for (let i = 0; i <= index; i++) {
      chessInstance.move(history[i]);
    }
    setPosition(chessInstance.fen());
    setCurrentMoveIndex(index);
  };

  if (!match) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-4xl w-full flex flex-col max-h-[95vh] overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            PGN Viewer
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 flex flex-col lg:flex-row gap-6 overflow-y-auto">
          {isEditing ? (
            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Paste PGN</label>
              <textarea
                className="w-full flex-1 min-h-[300px] p-3 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 dark:text-white font-mono"
                value={pgnText}
                onChange={(e) => {
                  setPgnText(e.target.value);
                  setError('');
                }}
                placeholder="[Event &quot;FIDE World Cup 2017&quot;]&#10;[Site &quot;Tbilisi GEO&quot;]&#10;..."
              />
              {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
              <div className="mt-4 flex gap-2 justify-end">
                {match.pgn && (
                  <Button variant="outline" onClick={() => {
                    setPgnText(match.pgn || '');
                    setIsEditing(false);
                    setError('');
                  }}>
                    Cancel
                  </Button>
                )}
                <Button onClick={handleSave} className="gap-2">
                  <Save className="w-4 h-4" /> Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 w-full lg:w-[400px]">
                <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-2 aspect-square">
                  <Chessboard options={{ position, allowDragging: false }} />
                </div>
                
                {/* Controls */}
                <div className="flex justify-center gap-2 mt-4">
                  <Button variant="outline" size="icon" onClick={() => handleMove(-1)} disabled={currentMoveIndex === -1}>
                    <SkipBack className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleMove(currentMoveIndex - 1)} disabled={currentMoveIndex === -1}>
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleMove(currentMoveIndex + 1)} disabled={currentMoveIndex === history.length - 1}>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleMove(history.length - 1)} disabled={currentMoveIndex === history.length - 1}>
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Moves</h3>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    Edit PGN
                  </Button>
                </div>
                <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 p-4 overflow-y-auto max-h-[450px]">
                  <div className="flex flex-wrap text-sm gap-x-2 gap-y-1">
                    {history.reduce((result: any[], move, index) => {
                      if (index % 2 === 0) {
                        result.push({ number: Math.floor(index / 2) + 1, white: { ...move, index }, black: null });
                      } else {
                        result[result.length - 1].black = { ...move, index };
                      }
                      return result;
                    }, []).map((pair: any, i: number) => (
                      <div key={i} className="flex gap-1.5 w-full sm:w-auto sm:min-w-[120px]">
                        <span className="text-slate-500 w-5">{pair.number}.</span>
                        <span 
                          onClick={() => handleMove(pair.white.index)}
                          className={`cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 px-1 rounded ${currentMoveIndex === pair.white.index ? 'bg-blue-200/80 dark:bg-blue-800 font-medium text-blue-900 dark:text-blue-100' : 'text-slate-700 dark:text-slate-300'}`}
                        >
                          {pair.white.san}
                        </span>
                        {pair.black && (
                          <span 
                            onClick={() => handleMove(pair.black.index)}
                            className={`cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 px-1 rounded ${currentMoveIndex === pair.black.index ? 'bg-blue-200/80 dark:bg-blue-800 font-medium text-blue-900 dark:text-blue-100' : 'text-slate-700 dark:text-slate-300'}`}
                          >
                            {pair.black.san}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
