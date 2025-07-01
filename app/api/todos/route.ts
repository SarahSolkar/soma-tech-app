import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const todos = await prisma.todo.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        dependencies: true,
        dependents: true,
      },
    });
    return NextResponse.json(todos);
  } catch (error) {
    return NextResponse.json(
      { error: "Error fetching todos" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { title, dueDate, dependencyIds = [] } = await request.json();
    if (!title || title.trim() === "") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const todo = await prisma.todo.create({
      data: {
        title,
        dueDate: dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null,
        dependencies: {
          connect: dependencyIds.map((id: number) => ({ id })),
        },
      },
      include: {
        dependencies: true,
        dependents: true,
      },
    });
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error creating todo" }, { status: 500 });
  }
}
