#!/bin/bash

# Run npm demo for all demos in the demos folder in parallel

DEMOS_DIR="demos"

echo "Starting all demos in parallel..."
echo ""

# Array to store background process IDs
pids=()

# Loop through all subdirectories in the demos folder
for demo in "$DEMOS_DIR"/*/; do
    # Remove trailing slash and path prefix to get just the demo name
    demo_name=$(basename "$demo")
    
    echo "Starting demo: $demo_name"
    
    # Run in background and store the PID
    npm run demo --name="$demo_name" &
    pids+=($!)
done

echo ""
echo "All demos started. Process IDs: ${pids[*]}"
echo "Press Ctrl+C to stop all demos"
echo ""

# Wait for all background processes (optional - keeps script running)
wait
