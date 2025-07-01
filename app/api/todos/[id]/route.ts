import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  params: {
    id: string;
  };
}

export async function PUT(request: Request, { params }: Params) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { title, completed, dueDate, dependencyIds, imageUrl } = body;
    
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (completed !== undefined) updateData.completed = completed;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    
    if (dependencyIds !== undefined) {
      updateData.dependencies = {
        set: [],
        connect: dependencyIds.map((depId: number) => ({ id: depId })),
      };
    }

    const todo = await prisma.todo.update({
      where: { id },
      data: updateData,
      include: {
        dependencies: true,
        dependents: true,
      },
    });
    
    return NextResponse.json(todo);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error updating todo' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  try {
    await prisma.todo.delete({
      where: { id },
    });
    return NextResponse.json({ message: 'Todo deleted' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Error deleting todo' }, { status: 500 });
  }
}
