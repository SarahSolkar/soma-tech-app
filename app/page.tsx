"use client";
import { useState, useEffect, useMemo } from "react";
import { calculateCriticalPath, TodoWithCriticalPath } from "@/lib/criticalPath";

interface Todo {
  id: number;
  title: string;
  createdAt: string;
  dueDate: string | null;
  imageUrl: string | null;
  completed: boolean;
  dependencies: Todo[];
  dependents: Todo[];
}

export default function Home() {
  const [newTodo, setNewTodo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [selectedDependencies, setSelectedDependencies] = useState<number[]>([]);
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
  const [editDependencies, setEditDependencies] = useState<number[]>([]);
  const [showGraph, setShowGraph] = useState(false);

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const res = await fetch("/api/todos");
      const data = await res.json();
      setTodos(data);
    } catch (error) {
      console.error("Failed to fetch todos:", error);
    }
  };

  const todosWithCriticalPath = useMemo(() => {
    return calculateCriticalPath(todos);
  }, [todos]);

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: newTodo, 
          dueDate,
          dependencyIds: selectedDependencies 
        }),
      });
      const newTodoData = await res.json();
      setNewTodo("");
      setDueDate("");
      setSelectedDependencies([]);
      fetchImageForTodo(newTodoData.id, newTodo);
    } catch (error) {
      console.error("Failed to add todo:", error);
    }
  };

  const fetchImageForTodo = async (id: number, query: string) => {
    try {
      const res = await fetch(`/api/pexels?query=${query}`);
      const data = await res.json();
      const imageUrl = data.photos[0]?.src?.medium;
      if (imageUrl) {
        await fetch(`/api/todos/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl }),
        });
        fetchTodos();
      }
    } catch (error) {
      console.error("Failed to fetch image:", error);
    }
  };

  const handleDeleteTodo = async (id: number) => {
    try {
      await fetch(`/api/todos/${id}`, {
        method: "DELETE",
      });
      fetchTodos();
    } catch (error) {
      console.error("Failed to delete todo:", error);
    }
  };

  const handleToggleComplete = async (id: number, completed: boolean) => {
    try {
      await fetch(`/api/todos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      });
      fetchTodos();
    } catch (error) {
      console.error("Failed to update todo:", error);
    }
  };

  const handleUpdateDependencies = async (id: number) => {
    try {
      await fetch(`/api/todos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependencyIds: editDependencies }),
      });
      setEditingTodoId(null);
      setEditDependencies([]);
      fetchTodos();
    } catch (error) {
      console.error("Failed to update dependencies:", error);
    }
  };

  const startEditingDependencies = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditDependencies(todo.dependencies.map(d => d.id));
  };

  const getAvailableDependencies = (excludeId?: number) => {
    return todos.filter(todo => {
      if (excludeId && todo.id === excludeId) return false;
      if (excludeId) {
        // Prevent circular dependencies
        const wouldCreateCycle = (todoId: number, targetId: number): boolean => {
          const todo = todos.find(t => t.id === todoId);
          if (!todo) return false;
          if (todo.dependencies.some(d => d.id === targetId)) return true;
          return todo.dependencies.some(d => wouldCreateCycle(d.id, targetId));
        };
        if (wouldCreateCycle(excludeId, todo.id)) return true;
      }
      return true;
    });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500 flex flex-col items-center p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-4xl font-bold text-center text-white mb-8">
          Things To Do App
        </h1>
        
        <div className="mb-4 text-center">
          <button
            onClick={() => setShowGraph(!showGraph)}
            className="bg-white text-indigo-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition duration-300"
          >
            {showGraph ? "Hide Dependency Graph" : "Show Dependency Graph"}
          </button>
        </div>

        {showGraph && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowGraph(false)}>
            <div className="bg-white rounded-lg p-6 max-w-[95vw] max-h-[95vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Dependency Graph</h2>
                <button
                  onClick={() => setShowGraph(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="overflow-auto max-h-[80vh]">
                <DependencyGraph todos={todos} criticalPathMap={todosWithCriticalPath} />
              </div>
            </div>
          </div>
        )}

        <div className="bg-white bg-opacity-90 rounded-lg p-4 mb-6">
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-grow p-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                placeholder="Add a new todo"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
              />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="p-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
              />
              <button
                onClick={handleAddTodo}
                className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition duration-300"
              >
                Add
              </button>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dependencies (optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {getAvailableDependencies().map(todo => (
                  <label key={todo.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selectedDependencies.includes(todo.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDependencies([...selectedDependencies, todo.id]);
                        } else {
                          setSelectedDependencies(selectedDependencies.filter(id => id !== todo.id));
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-800">{todo.title}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <ul className="space-y-4">
          {todos.map((todo) => {
            const criticalInfo = todosWithCriticalPath.get(todo.id);
            return (
              <li
                key={todo.id}
                className="bg-white bg-opacity-90 p-4 rounded-lg shadow-lg"
              >
                <div className="flex items-start gap-4">
                  {todo.imageUrl ? (
                    <img
                      src={todo.imageUrl}
                      alt={todo.title}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-200 animate-pulse"></div>
                  )}
                  
                  <div className="flex-grow">
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => handleToggleComplete(todo.id, todo.completed)}
                        className="w-5 h-5 rounded"
                      />
                      <span className={`text-lg ${todo.completed ? "line-through text-gray-500" : "text-gray-800"}`}>
                        {todo.title}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      {todo.dueDate && (
                        <div>
                          <span className={`${
                            new Date(todo.dueDate) < new Date() && !todo.completed
                              ? "text-red-500 font-bold"
                              : ""
                          }`}>
                            Due: {formatDate(new Date(todo.dueDate))}
                          </span>
                        </div>
                      )}
                      
                      {criticalInfo?.earliestStartDate && (
                        <div>
                          Earliest Start: {formatDate(criticalInfo.earliestStartDate)}
                        </div>
                      )}
                      
                      {criticalInfo && criticalInfo.slack > 0 && (
                        <div>
                          Slack: {criticalInfo.slack.toFixed(0)} days
                        </div>
                      )}
                      
                      {todo.dependencies.length > 0 && (
                        <div>
                          Dependencies: {todo.dependencies.map(d => d.title).join(", ")}
                        </div>
                      )}
                      
                      {editingTodoId === todo.id ? (
                        <div className="mt-2">
                          <div className="flex flex-wrap gap-2 mb-2">
                            {getAvailableDependencies(todo.id).map(dep => (
                              <label key={dep.id} className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={editDependencies.includes(dep.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEditDependencies([...editDependencies, dep.id]);
                                    } else {
                                      setEditDependencies(editDependencies.filter(id => id !== dep.id));
                                    }
                                  }}
                                  className="rounded"
                                />
                                <span className="text-xs text-gray-800">{dep.title}</span>
                              </label>
                            ))}
                          </div>
                          <button
                            onClick={() => handleUpdateDependencies(todo.id)}
                            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingTodoId(null);
                              setEditDependencies([]);
                            }}
                            className="text-xs bg-gray-300 text-gray-700 px-2 py-1 rounded hover:bg-gray-400 ml-2"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditingDependencies(todo)}
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          Edit Dependencies
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="text-red-500 hover:text-red-700 transition duration-300"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function DependencyGraph({ todos, criticalPathMap }: { todos: Todo[], criticalPathMap: Map<number, TodoWithCriticalPath> }) {
  const nodeWidth = 140;
  const nodeHeight = 60;
  const levelHeight = 120;
  const horizontalSpacing = 180;
  const padding = 40;
  
  // Calculate required dimensions based on content
  const levels = new Map<number, number>();
  const positions = new Map<number, { x: number, y: number }>();
  
  const calculateLevel = (todoId: number, visited = new Set<number>()): number => {
    if (visited.has(todoId)) return 0;
    visited.add(todoId);
    
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return 0;
    
    if (todo.dependencies.length === 0) {
      levels.set(todoId, 0);
      return 0;
    }
    
    const maxDepLevel = Math.max(...todo.dependencies.map(d => calculateLevel(d.id, visited)));
    const level = maxDepLevel + 1;
    levels.set(todoId, level);
    return level;
  };
  
  todos.forEach(todo => calculateLevel(todo.id));
  
  const levelGroups = new Map<number, number[]>();
  levels.forEach((level, todoId) => {
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(todoId);
  });
  
  // Calculate SVG dimensions
  const maxLevel = Math.max(...levels.values());
  const maxNodesInLevel = Math.max(...Array.from(levelGroups.values()).map(group => group.length));
  
  const svgWidth = Math.max(800, maxNodesInLevel * horizontalSpacing + padding * 2);
  const svgHeight = Math.max(400, (maxLevel + 1) * levelHeight + padding * 2);
  
  levelGroups.forEach((todoIds, level) => {
    const spacing = svgWidth / (todoIds.length + 1);
    todoIds.forEach((todoId, index) => {
      positions.set(todoId, {
        x: spacing * (index + 1) - nodeWidth / 2,
        y: level * levelHeight + padding
      });
    });
  });
  
  // Get the critical path IDs
  const criticalPathIds = new Set<number>();
  let longestCriticalPath: number[] = [];
  
  // Find the longest critical path from the map
  criticalPathMap.forEach((todo) => {
    if (todo.isCritical && todo.criticalPath.length > longestCriticalPath.length) {
      longestCriticalPath = todo.criticalPath;
    }
  });
  
  // Add all IDs from the critical path to the set
  longestCriticalPath.forEach(id => criticalPathIds.add(id));
  
  // Check if an edge is part of the critical path
  const isEdgeOnCriticalPath = (fromId: number, toId: number): boolean => {
    if (!criticalPathIds.has(fromId) || !criticalPathIds.has(toId)) {
      return false;
    }
    
    // Check if these two nodes are consecutive in the critical path
    const fromIndex = longestCriticalPath.indexOf(fromId);
    const toIndex = longestCriticalPath.indexOf(toId);
    
    return fromIndex !== -1 && toIndex !== -1 && toIndex === fromIndex + 1;
  };
  
  return (
    <svg width={svgWidth} height={svgHeight} className="border rounded">
      {/* Draw dependencies */}
      {todos.map(todo => {
        const toPos = positions.get(todo.id);
        if (!toPos) return null;
        
        return todo.dependencies.map(dep => {
          const fromPos = positions.get(dep.id);
          if (!fromPos) return null;
          
          const isOnCriticalPath = isEdgeOnCriticalPath(dep.id, todo.id);
          
          return (
            <line
              key={`${dep.id}-${todo.id}`}
              x1={fromPos.x + nodeWidth / 2}
              y1={fromPos.y + nodeHeight}
              x2={toPos.x + nodeWidth / 2}
              y2={toPos.y}
              stroke={isOnCriticalPath ? "#ef4444" : "#9ca3af"}
              strokeWidth={isOnCriticalPath ? 3 : 1}
              markerEnd="url(#arrowhead)"
            />
          );
        });
      })}
      
      {/* Arrow marker definition */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#9ca3af" />
        </marker>
      </defs>
      
      {/* Draw nodes */}
      {todos.map(todo => {
        const pos = positions.get(todo.id);
        if (!pos) return null;
        
        const criticalInfo = criticalPathMap.get(todo.id);
        
        return (
          <g key={todo.id}>
            <rect
              x={pos.x}
              y={pos.y}
              width={nodeWidth}
              height={nodeHeight}
              rx={5}
              fill={todo.completed ? "#d1d5db" : criticalPathIds.has(todo.id) ? "#fee2e2" : "#e0e7ff"}
              stroke={criticalPathIds.has(todo.id) ? "#ef4444" : "#6366f1"}
              strokeWidth={criticalPathIds.has(todo.id) ? 2 : 1}
            />
            <text
              x={pos.x + nodeWidth / 2}
              y={pos.y + nodeHeight / 2 - 8}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-sm font-medium"
              fill={todo.completed ? "#6b7280" : "#1f2937"}
            >
              {todo.title.length > 18 ? todo.title.substring(0, 18) + "..." : todo.title}
            </text>
            {todo.dueDate && (
              <text
                x={pos.x + nodeWidth / 2}
                y={pos.y + nodeHeight / 2 + 8}
                textAnchor="middle"
                className="text-xs"
                fill="#6b7280"
              >
                {new Date(todo.dueDate).toLocaleDateString()}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}