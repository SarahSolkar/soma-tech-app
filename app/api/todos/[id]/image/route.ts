import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { imageUrl } = await request.json();
    const todo = await prisma.todo.update({
      where: { id: parseInt(params.id) },
      data: { imageUrl },
    });
    return NextResponse.json(todo, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error updating todo' }, { status: 500 });
  }
}