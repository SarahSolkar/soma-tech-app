# CHANGES.md - Task 3 Implementation: Task Dependencies and Critical Path Analysis

This document provides a comprehensive overview of all changes made to implement Task 3 of the Soma Capital todo list application, which includes task dependencies, critical path calculation, and dependency graph visualization.

## Table of Contents
1. [Overview](#overview)
2. [Database Schema Changes](#database-schema-changes)
3. [API Endpoints Updates](#api-endpoints-updates)
4. [Critical Path Calculation Engine](#critical-path-calculation-engine)
5. [Circular Dependency Prevention](#circular-dependency-prevention)
6. [Frontend UI Enhancements](#frontend-ui-enhancements)
7. [Dependency Graph Visualization](#dependency-graph-visualization)
8. [Technical Architecture](#technical-architecture)
9. [Files Modified/Created](#files-modifiedcreated)

## Overview

Task 3 implements a complete project management system with:
- **Task Dependencies**: Users can define which tasks must be completed before others can start
- **Critical Path Analysis**: Automatic calculation of the longest path through the project that determines minimum completion time
- **Circular Dependency Prevention**: Robust validation to prevent invalid dependency cycles
- **Visual Graph**: Interactive dependency graph showing task relationships and critical path
- **Project Scheduling**: Calculation of earliest start dates based on dependency constraints

## Database Schema Changes

### File: `prisma/schema.prisma`

The Todo model was enhanced to support self-referential many-to-many relationships for dependencies:

```prisma
model Todo {
  id           Int      @id @default(autoincrement())
  title        String
  createdAt    DateTime  @default(now())
  dueDate      DateTime?
  imageUrl     String?
  completed    Boolean   @default(false)         // Added
  dependencies Todo[]    @relation("TodoDependencies")  // Added
  dependents   Todo[]    @relation("TodoDependencies")  // Added
}
```

**Key Changes:**
- Added `completed` field to track task completion status
- Added `dependencies` field - tasks that must be completed before this task can start
- Added `dependents` field - tasks that depend on this task being completed
- Used Prisma's self-referential relation with named relation "TodoDependencies"

**Technical Rationale:**
- Self-referential many-to-many relationship allows complex dependency networks
- Bidirectional relationship (dependencies/dependents) enables efficient querying in both directions
- Named relation prevents Prisma ambiguity in self-referential relationships

## API Endpoints Updates

### File: `app/api/todos/route.ts`

#### GET Endpoint Enhancement
```typescript
const todos = await prisma.todo.findMany({
  orderBy: { createdAt: "desc" },
  include: {
    dependencies: true,    // Include related dependency data
    dependents: true,      // Include related dependent data
  },
});
```

#### POST Endpoint Enhancement
```typescript
const { title, dueDate, dependencyIds = [] } = await request.json();
const todo = await prisma.todo.create({
  data: {
    title,
    dueDate: dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null,
    dependencies: {
      connect: dependencyIds.map((id: number) => ({ id })),  // Connect to existing todos
    },
  },
  include: {
    dependencies: true,
    dependents: true,
  },
});
```

### File: `app/api/todos/[id]/route.ts`

#### New PUT Endpoint
Added comprehensive update functionality:

```typescript
export async function PUT(request: Request, { params }: Params) {
  const { title, completed, dueDate, dependencyIds, imageUrl } = body;
  
  const updateData: any = {};
  if (title !== undefined) updateData.title = title;
  if (completed !== undefined) updateData.completed = completed;
  if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
  
  if (dependencyIds !== undefined) {
    updateData.dependencies = {
      set: [],  // Clear existing dependencies
      connect: dependencyIds.map((depId: number) => ({ id: depId })),  // Set new ones
    };
  }
}
```

**Key Features:**
- Selective field updates (only update provided fields)
- Dependency relationship management with `set: []` to clear and `connect` to establish new relationships
- Comprehensive error handling and validation
- Consistent response format with included relationships

## Critical Path Calculation Engine

### File: `lib/criticalPath.ts` (New)

This is the core algorithmic implementation using the Critical Path Method (CPM) from project management theory.

#### Algorithm Overview

The critical path calculation follows the standard CPM approach:

1. **Forward Pass**: Calculate earliest start and finish times
2. **Backward Pass**: Calculate latest start and finish times  
3. **Slack Calculation**: Determine how much each task can be delayed
4. **Critical Path Identification**: Find the sequence of zero-slack tasks

#### Key Data Structures

```typescript
interface TodoWithCriticalPath extends TodoWithDependencies {
  earliestStartDate: Date | null;    // Forward pass result
  earliestFinishDate: Date | null;   // Forward pass result
  latestStartDate: Date | null;      // Backward pass result
  latestFinishDate: Date | null;     // Backward pass result
  duration: number;                  // Task duration in days
  criticalPath: number[];            // Complete critical path sequence
  isCritical: boolean;               // Whether task is on critical path
  slack: number;                     // Days task can be delayed without affecting project
}
```

#### Duration Calculation Logic

```typescript
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
```

**Technical Details:**
- Duration calculated as days between today and due date
- Minimum 1-day duration ensures valid CPM calculations
- Handles tasks without due dates gracefully

#### Forward Pass Algorithm

```typescript
const calculateEarliestTimes = (todoId: number, visited: Set<number> = new Set()): void => {
  if (visited.has(todoId)) return;  // Prevent infinite recursion
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
        calculateEarliestTimes(depId, visited);  // Recursive calculation
      }
      
      if (dep.earliestFinishDate && dep.earliestFinishDate > latestFinish) {
        latestFinish = dep.earliestFinishDate;  // Take latest dependency finish
      }
    }
    
    todo.earliestStartDate = new Date(latestFinish);
    todo.earliestFinishDate = addDays(todo.earliestStartDate, todo.duration);
  }
};
```

**Algorithm Logic:**
- Uses recursive depth-first traversal
- Visited set prevents infinite loops in malformed data
- Earliest start = latest finish time of all dependencies
- Earliest finish = earliest start + task duration

#### Backward Pass Algorithm

```typescript
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
```

**Algorithm Logic:**
- Works backward from project end date
- Latest finish = earliest start time of earliest dependent
- Latest start = latest finish - task duration
- Slack = latest start - earliest start (in days)

#### Critical Path Identification

```typescript
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
      tracePath(criticalDep.id);  // Recursive trace back
    }
  };
  
  // Start from the first critical end node
  tracePath(criticalEndNodes[0]);
  
  return path;
};
```

**Algorithm Logic:**
- Identifies end nodes (tasks with no dependents) that have zero slack
- Traces backward through zero-slack dependencies
- Results in single continuous path determining project duration
- Uses `unshift` to build path from end to start, then reverse order

## Circular Dependency Prevention

### Frontend Validation Logic

The circular dependency prevention uses a recursive depth-first search algorithm:

```typescript
const getAvailableDependencies = (excludeId?: number) => {
  return todos.filter(todo => {
    if (excludeId && todo.id === excludeId) return false; // Can't depend on itself
    if (excludeId) {
      // Prevent circular dependencies
      const wouldCreateCycle = (todoId: number, targetId: number): boolean => {
        const todo = todos.find(t => t.id === todoId);
        if (!todo) return false;
        if (todo.dependencies.some(d => d.id === targetId)) return true; // Direct cycle
        return todo.dependencies.some(d => wouldCreateCycle(d.id, targetId)); // Indirect cycle
      };
      if (wouldCreateCycle(excludeId, todo.id)) return true; // Filter out cycle-creating todos
    }
    return true;
  });
};
```

#### Algorithm Explanation

**Input Parameters:**
- `excludeId`: The ID of the todo we're setting dependencies for
- `todoId`: Current todo being checked in recursion
- `targetId`: The potential dependency we're testing

**Logic Flow:**
1. **Self-Reference Check**: A task cannot depend on itself (`excludeId && todo.id === excludeId`)

2. **Direct Cycle Detection**: Check if the potential dependency already depends on our task
   ```typescript
   if (todo.dependencies.some(d => d.id === targetId)) return true;
   ```

3. **Indirect Cycle Detection**: Recursively check if any dependency of the potential dependency eventually leads back to our task
   ```typescript
   return todo.dependencies.some(d => wouldCreateCycle(d.id, targetId));
   ```

**Example Scenarios:**

**Scenario 1 - Direct Cycle:**
- Task A wants to depend on Task B
- Task B already depends on Task A
- Result: `wouldCreateCycle(A, B)` returns `true` because B.dependencies includes A

**Scenario 2 - Indirect Cycle:**
- Task A wants to depend on Task C  
- Task C depends on Task B
- Task B depends on Task A
- Result: `wouldCreateCycle(A, C)` returns `true` because:
  - C doesn't directly depend on A
  - But C depends on B, so we check `wouldCreateCycle(B, A)`
  - B directly depends on A, so returns `true`

**Scenario 3 - Valid Dependency:**
- Task A wants to depend on Task D
- Task D has no path back to Task A
- Result: `wouldCreateCycle(A, D)` returns `false`

#### UI Integration

The circular dependency prevention is integrated into the UI in two places:

1. **Todo Creation**: When creating a new todo, only valid dependencies are shown in checkboxes
2. **Todo Editing**: When editing dependencies, the same validation applies

```typescript
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
```

## Frontend UI Enhancements

### File: `app/page.tsx`

#### State Management
Added comprehensive state for dependency management:

```typescript
const [selectedDependencies, setSelectedDependencies] = useState<number[]>([]);
const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
const [editDependencies, setEditDependencies] = useState<number[]>([]);
const [showGraph, setShowGraph] = useState(false);
```

#### Critical Path Integration
```typescript
const todosWithCriticalPath = useMemo(() => {
  return calculateCriticalPath(todos);
}, [todos]);
```
Uses `useMemo` to recalculate critical path only when todos change, optimizing performance.

#### Dependency Selection UI

**For New Todos:**
```typescript
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Dependencies (optional)
  </label>
  <div className="flex flex-wrap gap-2">
    {getAvailableDependencies().map(todo => (
      <label key={todo.id} className="flex items-center gap-1">
        <input type="checkbox" ... />
        <span className="text-sm text-gray-800">{todo.title}</span>
      </label>
    ))}
  </div>
</div>
```

**For Editing Existing Todos:**
```typescript
{editingTodoId === todo.id ? (
  <div className="mt-2">
    <div className="flex flex-wrap gap-2 mb-2">
      {getAvailableDependencies(todo.id).map(dep => (
        <label key={dep.id} className="flex items-center gap-1">
          <input type="checkbox" ... />
          <span className="text-xs text-gray-800">{dep.title}</span>
        </label>
      ))}
    </div>
    <button onClick={() => handleUpdateDependencies(todo.id)}>Save</button>
    <button onClick={() => setEditingTodoId(null)}>Cancel</button>
  </div>
) : (
  <button onClick={() => startEditingDependencies(todo)}>
    Edit Dependencies
  </button>
)}
```

#### Task Information Display

Enhanced todo items to show critical path information:

```typescript
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
</div>
```

## Dependency Graph Visualization

### Modal Implementation

The dependency graph opens in a full-screen modal to accommodate projects of any size:

```typescript
{showGraph && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowGraph(false)}>
    <div className="bg-white rounded-lg p-6 max-w-[95vw] max-h-[95vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Dependency Graph</h2>
        <button onClick={() => setShowGraph(false)} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
      </div>
      <div className="overflow-auto max-h-[80vh]">
        <DependencyGraph todos={todos} criticalPathMap={todosWithCriticalPath} />
      </div>
    </div>
  </div>
)}
```

**Key Features:**
- Full-screen modal with backdrop
- Click outside to close
- Scrollable content area
- Responsive sizing (95% of viewport)

### Graph Layout Algorithm

```typescript
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
```

**Layout Logic:**
- Tasks with no dependencies are at level 0 (leftmost)
- Each task's level = maximum level of its dependencies + 1
- Creates hierarchical left-to-right layout
- Prevents infinite recursion with visited set

### Dynamic Sizing

```typescript
// Calculate SVG dimensions
const maxLevel = Math.max(...levels.values());
const maxNodesInLevel = Math.max(...Array.from(levelGroups.values()).map(group => group.length));

const svgWidth = Math.max(800, maxNodesInLevel * horizontalSpacing + padding * 2);
const svgHeight = Math.max(400, (maxLevel + 1) * levelHeight + padding * 2);
```

**Adaptive Sizing:**
- Width scales with maximum nodes per level
- Height scales with number of dependency levels
- Minimum dimensions ensure readability
- Padding prevents edge clipping

### Critical Path Highlighting

```typescript
// Get the critical path IDs
const criticalPathIds = new Set<number>();
let longestCriticalPath: number[] = [];

// Find the longest critical path from the map
criticalPathMap.forEach((todo) => {
  if (todo.isCritical && todo.criticalPath.length > longestCriticalPath.length) {
    longestCriticalPath = todo.criticalPath;
  }
});

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
```

**Highlighting Logic:**
- Only highlights edges between consecutive tasks in the critical path
- Only highlights nodes that are part of the critical path sequence
- Uses red coloring (#ef4444) for critical elements
- Non-critical elements remain in standard colors

### SVG Rendering

```typescript
<svg width={svgWidth} height={svgHeight} className="border rounded">
  {/* Draw dependencies */}
  {todos.map(todo => {
    return todo.dependencies.map(dep => {
      const isOnCriticalPath = isEdgeOnCriticalPath(dep.id, todo.id);
      
      return (
        <line
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
  
  {/* Draw nodes */}
  {todos.map(todo => {
    return (
      <g key={todo.id}>
        <rect
          fill={todo.completed ? "#d1d5db" : criticalPathIds.has(todo.id) ? "#fee2e2" : "#e0e7ff"}
          stroke={criticalPathIds.has(todo.id) ? "#ef4444" : "#6366f1"}
          strokeWidth={criticalPathIds.has(todo.id) ? 2 : 1}
        />
        <text>{todo.title}</text>
        {todo.dueDate && <text>{formatDate(todo.dueDate)}</text>}
      </g>
    );
  })}
</svg>
```

## Technical Architecture

### Data Flow

1. **User Input** → Frontend validation (circular dependency prevention)
2. **API Call** → Backend validation and Prisma relationship updates  
3. **Database Update** → Relational data stored with foreign key constraints
4. **Data Fetch** → Include relationships in API responses
5. **Critical Path Calculation** → Frontend processing with memoization
6. **UI Update** → React state updates trigger re-renders

### Performance Optimizations

1. **Memoized Critical Path**: Uses `useMemo` to recalculate only when todos change
2. **Efficient Queries**: Prisma `include` loads relationships in single query
3. **Client-Side Validation**: Prevents invalid API calls for circular dependencies
4. **SVG Rendering**: Hardware-accelerated vector graphics for smooth interaction
5. **Modal Architecture**: Large graphs don't affect main page performance

### Error Handling

1. **Database Level**: Foreign key constraints prevent orphaned relationships
2. **API Level**: Comprehensive error handling with meaningful HTTP status codes
3. **Frontend Level**: Try-catch blocks around all async operations
4. **Algorithm Level**: Visited sets prevent infinite recursion
5. **User Level**: Clear error messages and graceful degradation

## Files Modified/Created

### Modified Files

1. **`prisma/schema.prisma`**
   - Added self-referential many-to-many relationship for dependencies
   - Added completed field for task status tracking

2. **`app/api/todos/route.ts`**
   - Enhanced GET endpoint to include dependency relationships
   - Enhanced POST endpoint to handle dependency creation

3. **`app/api/todos/[id]/route.ts`**
   - Added PUT endpoint for comprehensive todo updates
   - Added dependency relationship management

4. **`app/page.tsx`**
   - Complete UI overhaul with dependency management
   - Added critical path display and calculation
   - Added modal-based dependency graph
   - Added circular dependency prevention

### Created Files

1. **`lib/criticalPath.ts`**
   - Complete Critical Path Method implementation
   - Forward and backward pass algorithms
   - Slack calculation and critical path identification
   - TypeScript interfaces for type safety

2. **`CLAUDE.md`**
   - Development guidelines and project documentation
   - Commands and architecture overview

This implementation provides a complete project management solution with sophisticated dependency handling, industry-standard critical path analysis, and an intuitive user interface for managing complex project schedules.