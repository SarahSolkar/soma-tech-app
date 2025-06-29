import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${query}&per_page=1`,
      {
        headers: {
          Authorization: process.env.PEXELS_API_KEY || "",
        },
      }
    );
    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Error fetching image" },
      { status: 500 }
    );
  }
}
