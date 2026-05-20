import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
	title: "SketchBoard — Open-source canvas drawing & animation",
	description:
		"Interactive demo for @sketchboard/core — an infinite canvas drawing engine for the web.",
}

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
}

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
			</head>
			<body className="antialiased">{children}</body>
		</html>
	)
}
