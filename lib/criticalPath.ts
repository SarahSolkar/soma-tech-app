export interface TodoWithDependencies {
  id: number;
  title: string;
  dueDate: Date | string | null;
  completed: boolean;
  dependencies: TodoWithDependencies[];
  dependents: TodoWithDependencies[];
}

export interface TodoWithCriticalPath extends TodoWithDependencies {
  earliestStartDate: Date | null;
  earliestFinishDate: Date | null;
  latestStartDate: Date | null;
  latestFinishDate: Date | null;
  duration: number; // in days
  criticalPath: number[];
  isCritical: boolean;
  slack: number;
}

export function calculateCriticalPath(todos: TodoWithDependencies[]): Map<number, TodoWithCriticalPath> {
  const todoMap = new Map<number, TodoWithCriticalPath>();
  const graph = new Map<number, Set<number>>();
  
  // Helper to convert date strings to Date objects
  const toDate = (date: Date | string | null): Date | null => {
    if (!date) return null;
    if (date instanceof Date) return date;
    return new Date(date);
  };

  // Helper to add days to a date
  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Calculate duration between today and due date (minimum 1 day)
  const calculateDuration = (dueDate: Date | null): number => {
    if (!dueDate) return 1; // Default duration of 1 day if no due date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays); // Minimum 1 day duration
  };

  // Initialize todos and build dependency graph
  todos.forEach(todo => {
    const dueDate = toDate(todo.dueDate);
    const duration = calculateDuration(dueDate);
    
    todoMap.set(todo.id, {
      ...todo,
      dueDate,
      duration,
      earliestStartDate: null,
      earliestFinishDate: null,
      latestStartDate: null,
      latestFinishDate: null,
      criticalPath: [],
      isCritical: false,
      slack: 0,
    });
    graph.set(todo.id, new Set(todo.dependencies.map(dep => dep.id)));
  });

  // Find all tasks with no dependencies (start nodes)
  const startNodes = todos.filter(todo => todo.dependencies.length === 0).map(t => t.id);
  
  // Find all tasks with no dependents (end nodes)
  const endNodes = todos.filter(todo => todo.dependents.length === 0).map(t => t.id);

  // Forward pass - calculate earliest start and finish times
  const calculateEarliestTimes = (todoId: number, visited: Set<number> = new Set()): void => {
    if (visited.has(todoId)) return;
    visited.add(todoId);
    
    const todo = todoMap.get(todoId);
    if (!todo) return;
    
    const dependencies = Array.from(graph.get(todoId) || []);
    
    if (dependencies.length === 0) {
      // No dependencies - can start immediately
      todo.earliestStartDate = new Date();
      todo.earliestFinishDate = addDays(todo.earliestStartDate, todo.duration);
    } else {
      // Has dependencies - must wait for all to complete
      let latestFinish = new Date(0); // Very early date
      
      for (const depId of dependencies) {
        const dep = todoMap.get(depId);
        if (!dep) continue;
        
        if (!dep.earliestFinishDate) {
          calculateEarliestTimes(depId, visited);
        }
        
        if (dep.earliestFinishDate && dep.earliestFinishDate > latestFinish) {
          latestFinish = dep.earliestFinishDate;
        }
      }
      
      todo.earliestStartDate = new Date(latestFinish);
      todo.earliestFinishDate = addDays(todo.earliestStartDate, todo.duration);
    }
  };

  // Backward pass - calculate latest start and finish times
  const calculateLatestTimes = (todoId: number, projectEndDate: Date, visited: Set<number> = new Set()): void => {
    if (visited.has(todoId)) return;
    visited.add(todoId);
    
    const todo = todoMap.get(todoId);
    if (!todo) return;
    
    const dependents = todos.filter(t => t.dependencies.some(d => d.id === todoId)).map(t => t.id);
    
    if (dependents.length === 0) {
      // No dependents - latest finish is project end or due date
      todo.latestFinishDate = todo.dueDate || projectEndDate;
      todo.latestStartDate = addDays(todo.latestFinishDate, -todo.duration);
    } else {
      // Has dependents - must finish before earliest dependent starts
      let earliestDependentStart = projectEndDate;
      
      for (const depId of dependents) {
        const dep = todoMap.get(depId);
        if (!dep) continue;
        
        if (!dep.latestStartDate) {
          calculateLatestTimes(depId, projectEndDate, visited);
        }
        
        if (dep.latestStartDate && dep.latestStartDate < earliestDependentStart) {
          earliestDependentStart = dep.latestStartDate;
        }
      }
      
      todo.latestFinishDate = new Date(earliestDependentStart);
      todo.latestStartDate = addDays(todo.latestFinishDate, -todo.duration);
    }
    
    // Calculate slack
    if (todo.earliestStartDate && todo.latestStartDate) {
      const slackMs = todo.latestStartDate.getTime() - todo.earliestStartDate.getTime();
      todo.slack = Math.max(0, slackMs / (1000 * 60 * 60 * 24));
    }
  };

  // Find the critical path
  const findCriticalPath = (): number[] => {
    // Find the end node(s) with zero slack
    const criticalEndNodes = endNodes.filter(nodeId => {
      const node = todoMap.get(nodeId);
      return node && node.slack === 0;
    });
    
    if (criticalEndNodes.length === 0) return [];
    
    // Trace back through the network following zero-slack path
    const path: number[] = [];
    const tracePath = (nodeId: number): void => {
      const node = todoMap.get(nodeId);
      if (!node) return;
      
      path.unshift(nodeId); // Add to beginning of path
      
      // Find critical predecessor (dependency with zero slack)
      const criticalDep = node.dependencies.find(dep => {
        const depNode = todoMap.get(dep.id);
        return depNode && depNode.slack === 0;
      });
      
      if (criticalDep) {
        tracePath(criticalDep.id);
      }
    };
    
    // Start from the first critical end node
    tracePath(criticalEndNodes[0]);
    
    return path;
  };

  try {
    // Forward pass - calculate earliest times
    todos.forEach(todo => {
      calculateEarliestTimes(todo.id);
    });
    
    // Find project end date (latest earliest finish)
    let projectEndDate = new Date();
    todos.forEach(todo => {
      const todoData = todoMap.get(todo.id);
      if (todoData?.earliestFinishDate && todoData.earliestFinishDate > projectEndDate) {
        projectEndDate = todoData.earliestFinishDate;
      }
    });
    
    // Backward pass - calculate latest times
    todos.forEach(todo => {
      calculateLatestTimes(todo.id, projectEndDate);
    });
    
    // Find the critical path
    const criticalPath = findCriticalPath();
    
    // Mark all tasks on the critical path
    criticalPath.forEach(nodeId => {
      const node = todoMap.get(nodeId);
      if (node) {
        node.isCritical = true;
        node.criticalPath = criticalPath;
      }
    });
    
  } catch (error) {
    console.error('Error calculating critical path:', error);
  }
  
  return todoMap;
}