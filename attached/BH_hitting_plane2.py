#!/usr/bin/env python3
"""
Tennis Motion Analysis - Multi-Version Export
Generates 7 separate videos from one input:
1. Wrist trail only
2. Elbow trail only
3. Hip + Shoulder trails
4. Knee flexion only
5. Hip-Shoulder separation only
6. Hitting plane only
7. Complete (all features combined)
"""

import cv2
import mediapipe as mp
import numpy as np
from collections import deque
import os
from pathlib import Path
import colorsys

# ========================================
# CONFIG
# ========================================
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

# Video settings
SLOW_MOTION_FACTOR = 0.5
TARGET_SIZE = 1080

# Player settings - CHANGE THIS FOR LEFT/RIGHT HANDED PLAYERS
PLAYER_HAND = 'left'  # 'left' or 'right'

# Visual settings
TRAIL_LENGTH = 30
POSE_COLOR = (242, 171, 39)  # BGR - Orange
POSE_THICK = 5
CIRCLE_RADIUS = 8

# Hitting plane colors
HITTING_PLANE_COLOR = (255, 100, 255)  # Magenta
HITTING_PLANE_ALPHA = 0.4

# Set joints based on player handedness
if PLAYER_HAND == 'left':
    WRIST = 15
    ELBOW = 13
    SHOULDER = 11
    HIP = 23
    OTHER_HIP = 24
    KNEE = 25
    ANKLE = 27
    OTHER_KNEE = 26
    OTHER_ANKLE = 28
    SIDE_TEXT = "Left"
else:  # right
    WRIST = 16
    ELBOW = 14
    SHOULDER = 12
    HIP = 24
    OTHER_HIP = 23
    KNEE = 26
    ANKLE = 28
    OTHER_KNEE = 25
    OTHER_ANKLE = 27
    SIDE_TEXT = "Right"


# ========================================
# MOTION ANALYZER FOR TRAILS
# ========================================
class MotionAnalyzer:
    def __init__(self, max_len=TRAIL_LENGTH):
        self.trail = deque(maxlen=max_len)
        self.prev_pt = None
        self.prev_vel = 0.0
        self.prev_time = 0.0

    def update(self, pt, t):
        if self.prev_pt is None or t <= self.prev_time:
            self.prev_pt, self.prev_time = pt, t
            return 0.0, 0.0
        dt = max(t - self.prev_time, 1e-6)
        dx = pt[0] - self.prev_pt[0]
        dy = pt[1] - self.prev_pt[1]
        dist = np.hypot(dx, dy)
        vel = dist / dt
        acc = (vel - self.prev_vel) / dt
        self.prev_pt, self.prev_vel, self.prev_time = pt, vel, t
        return vel, acc

    def add(self, pt, color, acc):
        self.trail.append((pt, color, acc))

    def reset(self):
        self.trail.clear()
        self.prev_pt = None
        self.prev_vel = 0.0
        self.prev_time = 0.0


# ========================================
# COLOR FUNCTIONS
# ========================================
def hsv_to_bgr(h, s=1.0, v=1.0):
    """Convert HSV (0-1 range) to BGR"""
    h = np.clip(h, 0.0, 1.0)
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (int(b * 255), int(g * 255), int(r * 255))


def acceleration_color(acc, vmin=-1000, vmax=1000):
    """Deep Blue to Bright Red based on acceleration"""
    norm = np.clip((acc - vmin) / (vmax - vmin), 0, 1)
    hue = 0.666 - norm * 0.666  # 240° to 0° (blue to red)
    return hsv_to_bgr(hue, s=1.0, v=1.0)


def elbow_color(acc):
    """Bright Yellow to Intense Orange for elbow"""
    norm = np.clip((acc + 1000) / 2000, 0, 1)
    hue = 0.1667 - norm * 0.1333  # 60° to 20°
    return hsv_to_bgr(hue, s=1.0, v=1.0)


def knee_color(angle, is_primary=True):
    """Cyan to Deep Blue for primary knee, Magenta to Red for other knee"""
    norm = np.clip((180 - angle) / 100, 0, 1)
    if is_primary:
        hue = 0.5 + norm * 0.1667  # Cyan to Deep Blue
    else:
        hue = 0.8333 - norm * 0.8333  # Magenta to Deep Red
    return hsv_to_bgr(hue, s=1.0, v=1.0)


def hip_shoulder_color(separation, smin, smax):
    """Green to Red for hip/shoulder separation"""
    if smax == smin:
        return (0, 255, 0)
    norm = (separation - smin) / (smax - smin)
    hue = 0.333 - norm * 0.333  # 120° to 0°
    return hsv_to_bgr(hue, s=1.0, v=1.0)


# ========================================
# 3D ANGLE CALCULATIONS
# ========================================
def calculate_hitting_plane_angle(hip_3d, other_hip_3d, wrist_3d, player_hand='right'):
    """
    Calculate hitting plane angle relative to hip line
    
    Args:
        hip_3d: Playing side hip coordinates
        other_hip_3d: Non-playing side hip coordinates  
        wrist_3d: Playing side wrist coordinates
        player_hand: 'right' or 'left' - affects sign convention
        
    Returns:
        Angle in degrees where:
        - Positive = Open stance (wrist ahead of hip)
        - Negative = Closed stance (wrist behind hip)
    """
    hip_vector = hip_3d - other_hip_3d
    arm_vector = wrist_3d - hip_3d
    
    hip_vector_2d = np.array([hip_vector[0], hip_vector[2]])
    arm_vector_2d = np.array([arm_vector[0], arm_vector[2]])
    
    dot_product = np.dot(hip_vector_2d, arm_vector_2d)
    magnitude_hip = np.linalg.norm(hip_vector_2d)
    magnitude_arm = np.linalg.norm(arm_vector_2d)
    
    if magnitude_hip < 1e-6 or magnitude_arm < 1e-6:
        return 0.0
    
    cos_angle = dot_product / (magnitude_hip * magnitude_arm)
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    
    angle_between = np.degrees(np.arccos(cos_angle))
    hitting_plane = angle_between - 90.0
    
    cross_product = hip_vector_2d[0] * arm_vector_2d[1] - hip_vector_2d[1] * arm_vector_2d[0]
    
    # Right-handed: positive cross product = negative angle (closed)
    # Left-handed: reverse the sign logic
    if player_hand == 'right':
        if cross_product > 0:
            hitting_plane = -hitting_plane
    else:  # left-handed
        if cross_product < 0:
            hitting_plane = -hitting_plane
    
    return hitting_plane


# ========================================
# UTILITY FUNCTIONS
# ========================================
def make_square(frame):
    """Crop and resize frame to square"""
    h, w = frame.shape[:2]
    s = min(h, w)
    cy, cx = (h - s) // 2, (w - s) // 2
    cropped = frame[cy:cy + s, cx:cx + s]
    return cv2.resize(cropped, (TARGET_SIZE, TARGET_SIZE))


def draw_trail(frame, trail, thick=(2, 8)):
    """Draw smooth gradient trail"""
    if len(trail) < 2:
        return
    for i in range(len(trail) - 1):
        (x1, y1), c1, _ = trail[i]
        (x2, y2), c2, _ = trail[i + 1]
        alpha = i / len(trail)
        t = int(thick[0] + (thick[1] - thick[0]) * alpha)
        col = tuple(int((a + b) // 2) for a, b in zip(c1, c2))
        cv2.line(frame, (x1, y1), (x2, y2), col, t, cv2.LINE_AA)


def draw_joints(frame, lm, w, h):
    """Draw enhanced joint markers"""
    keys = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
    for i in keys:
        if i >= len(lm.landmark):
            continue
        x, y = int(lm.landmark[i].x * w), int(lm.landmark[i].y * h)
        cv2.circle(frame, (x, y), CIRCLE_RADIUS + 4, (255, 200, 100), 2)
        cv2.circle(frame, (x, y), CIRCLE_RADIUS, POSE_COLOR, -1)
        cv2.circle(frame, (x, y), 3, (255, 255, 255), -1)


def knee_angle(hip, knee, ankle):
    """Calculate knee flexion angle"""
    v1 = np.array(hip) - knee
    v2 = np.array(ankle) - knee
    cos = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def draw_line_with_overlay(frame, pt1, pt2, color, thickness=8, alpha=0.3):
    """Draw semi-transparent line"""
    overlay = frame.copy()
    cv2.line(overlay, pt1, pt2, color, thickness, cv2.LINE_AA)
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
    cv2.line(frame, pt1, pt2, color, max(2, thickness // 4), cv2.LINE_AA)
    cv2.circle(frame, pt1, thickness // 2, color, -1)
    cv2.circle(frame, pt2, thickness // 2, color, -1)


def add_title(frame, title, w):
    """Add title to frame"""
    panel_height = 80
    panel = np.zeros((panel_height, w, 3), dtype=np.uint8)
    panel[:] = (30, 30, 30)
    
    frame_top = frame[:panel_height].copy()
    cv2.addWeighted(panel, 0.75, frame_top, 0.25, 0, frame_top)
    frame[:panel_height] = frame_top
    
    cv2.putText(frame, title, (20, 50),
               cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)


def draw_dynamic_label(frame, text, position, color, bg_color=(0, 0, 0), offset=(10, -10)):
    """
    Draw text label that follows a point with background
    
    Args:
        frame: image frame
        text: text to display
        position: (x, y) position to anchor label near
        color: text color
        bg_color: background color
        offset: (x_offset, y_offset) from position
    """
    x, y = position
    x += offset[0]
    y += offset[1]
    
    # Get text size
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.7
    thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(text, font, font_scale, thickness)
    
    # Draw background rectangle
    padding = 8
    cv2.rectangle(frame, 
                 (x - padding, y - text_h - padding),
                 (x + text_w + padding, y + baseline + padding),
                 bg_color, -1)
    
    # Draw border
    cv2.rectangle(frame, 
                 (x - padding, y - text_h - padding),
                 (x + text_w + padding, y + baseline + padding),
                 color, 2)
    
    # Draw text
    cv2.putText(frame, text, (x, y), font, font_scale, color, thickness, cv2.LINE_AA)


def draw_speed_indicator(frame, position, speed, color, max_speed=3000):
    """
    Draw speed/acceleration indicator bar near a point
    
    Args:
        frame: image frame
        position: (x, y) position
        speed: current speed/acceleration value
        color: bar color
        max_speed: maximum speed for normalization
    """
    x, y = position
    
    # Normalize speed
    normalized = min(abs(speed) / max_speed, 1.0)
    bar_length = int(100 * normalized)
    
    # Draw background bar
    cv2.rectangle(frame, (x + 50, y - 15), (x + 150, y + 5), (50, 50, 50), -1)
    cv2.rectangle(frame, (x + 50, y - 15), (x + 150, y + 5), (200, 200, 200), 2)
    
    # Draw filled bar
    if bar_length > 0:
        cv2.rectangle(frame, (x + 50, y - 15), (x + 50 + bar_length, y + 5), color, -1)
    
    # Draw speed value
    speed_text = f"{abs(speed):.0f}"
    cv2.putText(frame, speed_text, (x + 155, y), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA)


# ========================================
# CALCULATE HIP/SHOULDER SEPARATION RANGE
# ========================================
def calculate_separation_range(video_path):
    """First pass to calculate min/max hip-shoulder separation"""
    cap = cv2.VideoCapture(video_path)
    angles = []
    
    with mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5, model_complexity=2) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = pose.process(rgb)
            
            if res.pose_landmarks:
                lm = res.pose_landmarks.landmark
                h_ang = np.degrees(np.arctan2(lm[HIP].y - lm[OTHER_HIP].y, 
                                              lm[HIP].x - lm[OTHER_HIP].x))
                s_ang = np.degrees(np.arctan2(lm[SHOULDER].y - lm[11 if PLAYER_HAND == 'right' else 12].y,
                                              lm[SHOULDER].x - lm[11 if PLAYER_HAND == 'right' else 12].x))
                angles.append(abs(h_ang - s_ang))
    
    cap.release()
    
    if angles:
        return min(angles), max(angles)
    return 0, 180


# ========================================
# VERSION PROCESSING FUNCTIONS
# ========================================

def process_version(video_path, output_path, version_type, sep_min, sep_max):
    """
    Process video for specific version type
    version_type: 'wrist', 'elbow', 'hip_shoulder', 'knee', 'separation', 'hitting_plane', 'complete'
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return False
    
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps * SLOW_MOTION_FACTOR, (TARGET_SIZE, TARGET_SIZE))
    
    # Initialize analyzers
    wrist_analyzer = MotionAnalyzer(TRAIL_LENGTH)
    elbow_analyzer = MotionAnalyzer(TRAIL_LENGTH)
    hip_analyzer = MotionAnalyzer(50)
    shoulder_analyzer = MotionAnalyzer(50)
    
    frame_count = 0
    
    # Version titles
    titles = {
        'wrist': f"{SIDE_TEXT} Wrist Trail",
        'elbow': f"{SIDE_TEXT} Elbow Trail",
        'hip_shoulder': "Hip + Shoulder Trails",
        'knee': "Knee Flexion Analysis",
        'separation': "Hip-Shoulder Separation",
        'hitting_plane': "Hitting Plane",
        'complete': f"{SIDE_TEXT}-Handed Complete Analysis"
    }
    
    with mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5, model_complexity=2) as pose:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            time = frame_count / fps
            
            frame = make_square(frame)
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose.process(rgb)
            
            if results.pose_landmarks:
                lm = results.pose_landmarks.landmark
                
                # Get key points
                wrist_pt = (int(lm[WRIST].x * w), int(lm[WRIST].y * h))
                elbow_pt = (int(lm[ELBOW].x * w), int(lm[ELBOW].y * h))
                hip_pt = (int(lm[HIP].x * w), int(lm[HIP].y * h))
                shoulder_pt = (int(lm[SHOULDER].x * w), int(lm[SHOULDER].y * h))
                
                # Update analyzers
                _, wrist_acc = wrist_analyzer.update(wrist_pt, time)
                wrist_analyzer.add(wrist_pt, acceleration_color(wrist_acc), wrist_acc)
                
                _, elbow_acc = elbow_analyzer.update(elbow_pt, time)
                elbow_analyzer.add(elbow_pt, elbow_color(elbow_acc), elbow_acc)
                
                _, hip_acc = hip_analyzer.update(hip_pt, time)
                hip_analyzer.add(hip_pt, (0, 255, 255), hip_acc)
                
                _, shoulder_acc = shoulder_analyzer.update(shoulder_pt, time)
                shoulder_analyzer.add(shoulder_pt, (255, 0, 255), shoulder_acc)
                
                # Draw skeleton (lighter for non-complete versions)
                if version_type == 'complete':
                    mp_drawing.draw_landmarks(
                        frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS,
                        mp_drawing.DrawingSpec(color=POSE_COLOR, thickness=POSE_THICK),
                        mp_drawing.DrawingSpec(color=POSE_COLOR, thickness=POSE_THICK)
                    )
                    draw_joints(frame, results.pose_landmarks, w, h)
                else:
                    mp_drawing.draw_landmarks(
                        frame, results.pose_landmarks, mp_pose.POSE_CONNECTIONS,
                        mp_drawing.DrawingSpec(color=(200, 200, 200), thickness=2),
                        mp_drawing.DrawingSpec(color=(200, 200, 200), thickness=2)
                    )
                
                # Draw based on version type
                if version_type in ['wrist', 'complete']:
                    draw_trail(frame, wrist_analyzer.trail, thick=(3, 10))
                
                if version_type in ['elbow', 'complete']:
                    draw_trail(frame, elbow_analyzer.trail, thick=(3, 10))
                
                if version_type in ['hip_shoulder', 'complete']:
                    draw_trail(frame, hip_analyzer.trail, thick=(2, 8))
                    draw_trail(frame, shoulder_analyzer.trail, thick=(2, 8))
                
                if version_type in ['knee', 'complete']:
                    # Primary knee
                    primary_hip_pt = (int(lm[HIP].x * w), int(lm[HIP].y * h))
                    primary_knee_pt = (int(lm[KNEE].x * w), int(lm[KNEE].y * h))
                    primary_ankle_pt = (int(lm[ANKLE].x * w), int(lm[ANKLE].y * h))
                    primary_angle = knee_angle(primary_hip_pt, primary_knee_pt, primary_ankle_pt)
                    primary_col = knee_color(primary_angle, True)
                    
                    cv2.line(frame, primary_hip_pt, primary_knee_pt, primary_col, 12, cv2.LINE_AA)
                    cv2.line(frame, primary_knee_pt, primary_ankle_pt, primary_col, 12, cv2.LINE_AA)
                    cv2.circle(frame, primary_knee_pt, 20, (255, 255, 255), 3)
                    cv2.circle(frame, primary_knee_pt, 16, primary_col, -1)
                    
                    # Dynamic angle label for primary knee
                    if version_type == 'knee':
                        draw_dynamic_label(frame, f"{primary_angle:.0f}°", primary_knee_pt, 
                                         primary_col, offset=(35, -5))
                    
                    # Other knee
                    other_hip_pt = (int(lm[OTHER_HIP].x * w), int(lm[OTHER_HIP].y * h))
                    other_knee_pt = (int(lm[OTHER_KNEE].x * w), int(lm[OTHER_KNEE].y * h))
                    other_ankle_pt = (int(lm[OTHER_ANKLE].x * w), int(lm[OTHER_ANKLE].y * h))
                    other_angle = knee_angle(other_hip_pt, other_knee_pt, other_ankle_pt)
                    other_col = knee_color(other_angle, False)
                    
                    cv2.line(frame, other_hip_pt, other_knee_pt, other_col, 12, cv2.LINE_AA)
                    cv2.line(frame, other_knee_pt, other_ankle_pt, other_col, 12, cv2.LINE_AA)
                    cv2.circle(frame, other_knee_pt, 20, (255, 255, 255), 3)
                    cv2.circle(frame, other_knee_pt, 16, other_col, -1)
                    
                    # Dynamic angle label for other knee
                    if version_type == 'knee':
                        draw_dynamic_label(frame, f"{other_angle:.0f}°", other_knee_pt, 
                                         other_col, offset=(-120, -5))
                
                if version_type in ['separation', 'complete']:
                    h_ang = np.degrees(np.arctan2(lm[HIP].y - lm[OTHER_HIP].y, 
                                                  lm[HIP].x - lm[OTHER_HIP].x))
                    s_ang = np.degrees(np.arctan2(lm[SHOULDER].y - lm[11 if PLAYER_HAND == 'right' else 12].y,
                                                  lm[SHOULDER].x - lm[11 if PLAYER_HAND == 'right' else 12].x))
                    separation = abs(h_ang - s_ang)
                    sep_color = hip_shoulder_color(separation, sep_min, sep_max)
                    
                    other_hip_2d = (int(lm[OTHER_HIP].x * w), int(lm[OTHER_HIP].y * h))
                    other_shoulder_2d = (int(lm[11 if PLAYER_HAND == 'right' else 12].x * w), 
                                        int(lm[11 if PLAYER_HAND == 'right' else 12].y * h))
                    
                    cv2.line(frame, hip_pt, other_hip_2d, sep_color, 10, cv2.LINE_AA)
                    cv2.line(frame, shoulder_pt, other_shoulder_2d, sep_color, 10, cv2.LINE_AA)
                    
                    # Dynamic separation measurement
                    if version_type == 'separation':
                        # Calculate center point between hip and shoulder centers
                        hip_center = ((hip_pt[0] + other_hip_2d[0]) // 2, (hip_pt[1] + other_hip_2d[1]) // 2)
                        shoulder_center = ((shoulder_pt[0] + other_shoulder_2d[0]) // 2, 
                                         (shoulder_pt[1] + other_shoulder_2d[1]) // 2)
                        torso_center = ((hip_center[0] + shoulder_center[0]) // 2,
                                       (hip_center[1] + shoulder_center[1]) // 2)
                        
                        # Draw connecting line
                        cv2.line(frame, hip_center, shoulder_center, (255, 255, 255), 2, cv2.LINE_AA)
                        cv2.circle(frame, torso_center, 8, sep_color, -1)
                        cv2.circle(frame, torso_center, 10, (255, 255, 255), 2)
                        
                        # Draw separation angle only
                        draw_dynamic_label(frame, f"{separation:.1f}°", torso_center, 
                                         sep_color, offset=(30, -10))
                
                if version_type in ['hitting_plane', 'complete']:
                    hip_3d = np.array([lm[HIP].x, lm[HIP].y, lm[HIP].z])
                    other_hip_3d = np.array([lm[OTHER_HIP].x, lm[OTHER_HIP].y, lm[OTHER_HIP].z])
                    wrist_3d = np.array([lm[WRIST].x, lm[WRIST].y, lm[WRIST].z])
                    
                    hitting_plane_angle = calculate_hitting_plane_angle(hip_3d, other_hip_3d, wrist_3d, PLAYER_HAND)
                    
                    draw_line_with_overlay(
                        frame, hip_pt, wrist_pt,
                        HITTING_PLANE_COLOR,
                        thickness=10,
                        alpha=HITTING_PLANE_ALPHA
                    )
                    
                    plane_color = (0, 255, 0) if hitting_plane_angle > 0 else (0, 0, 255)
                    cv2.circle(frame, wrist_pt, 35, plane_color, 4)
                    
                    # Dynamic hitting plane measurement
                    if version_type == 'hitting_plane':
                        # Draw angle at wrist
                        draw_dynamic_label(frame, f"{hitting_plane_angle:+.1f}°", wrist_pt, 
                                         plane_color, offset=(50, -30))
                        
                        # Status
                        if hitting_plane_angle > 10:
                            status = "OPEN"
                        elif hitting_plane_angle < -10:
                            status = "CLOSED"
                        else:
                            status = "NEUTRAL"
                        draw_dynamic_label(frame, status, wrist_pt, 
                                         plane_color, offset=(50, -5))
                        
                        # Draw arc showing the angle at hip
                        import math
                        arc_radius = 60
                        # Calculate hip line angle
                        hip_angle = math.degrees(math.atan2(other_hip_3d[1] - hip_3d[1], 
                                                            other_hip_3d[0] - hip_3d[0]))
                        # Draw reference arc
                        start_angle = int(hip_angle + 90)
                        end_angle = int(hip_angle + 90 + hitting_plane_angle)
                        cv2.ellipse(frame, hip_pt, (arc_radius, arc_radius), 0, 
                                  start_angle, end_angle, plane_color, 3)
            
            # Add title
            add_title(frame, titles[version_type], w)
            
            # Add compact info panel for complete version
            if version_type == 'complete' and results.pose_landmarks:
                panel_y = 90
                panel_height = 120
                panel = np.zeros((panel_height, w, 3), dtype=np.uint8)
                panel[:] = (20, 20, 20)
                
                frame_section = frame[panel_y:panel_y + panel_height].copy()
                cv2.addWeighted(panel, 0.7, frame_section, 0.3, 0, frame_section)
                frame[panel_y:panel_y + panel_height] = frame_section
                
                y = panel_y + 25
                spacing = 25
                
                # Wrist acceleration
                cv2.putText(frame, f"Wrist Acc: {wrist_acc:.0f}", (20, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, acceleration_color(wrist_acc), 2)
                y += spacing
                
                # Try to show other metrics if they exist
                try:
                    if 'primary_angle' in locals():
                        cv2.putText(frame, f"Knee: {primary_angle:.0f}° | {other_angle:.0f}°", (20, y),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 2)
                        y += spacing
                except:
                    pass
                
                try:
                    if 'hitting_plane_angle' in locals():
                        plane_color = (0, 255, 0) if hitting_plane_angle > 0 else (0, 0, 255)
                        cv2.putText(frame, f"Hitting Plane: {hitting_plane_angle:+.1f}°", (20, y),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, plane_color, 2)
                except:
                    pass
            
            # Frame counter
            cv2.putText(frame, f"Frame: {frame_count}/{total_frames}", 
                       (w - 220, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
            
            out.write(frame)
            
            # Progress
            if frame_count % 30 == 0:
                progress = (frame_count / total_frames) * 100
                print(f"      {version_type}: {progress:.1f}%", end='\r')
    
    cap.release()
    out.release()
    print(f"      {version_type}: 100% ✓")
    
    return True


# ========================================
# PROCESS ALL VERSIONS
# ========================================
def process_all_versions(video_path, output_folder):
    """Process video and create all 7 versions"""
    video_name = Path(video_path).stem
    
    print(f"\n{'=' * 70}")
    print(f"Processing: {Path(video_path).name}")
    print(f"{'=' * 70}")
    
    # Calculate separation range first
    print("   Analyzing hip/shoulder separation range...")
    sep_min, sep_max = calculate_separation_range(video_path)
    print(f"   Range: {sep_min:.1f}° to {sep_max:.1f}°")
    
    # Define all versions
    versions = [
        ('wrist', 'v1_wrist_trail'),
        ('elbow', 'v2_elbow_trail'),
        ('hip_shoulder', 'v3_hip_shoulder'),
        ('knee', 'v4_knee_flexion'),
        ('separation', 'v5_separation'),
        ('hitting_plane', 'v6_hitting_plane'),
        ('complete', 'v7_complete')
    ]
    
    success_count = 0
    
    print("\n   Creating 7 versions:")
    for version_type, suffix in versions:
        output_path = os.path.join(output_folder, f"{video_name}_{suffix}.mp4")
        try:
            success = process_version(video_path, output_path, version_type, sep_min, sep_max)
            if success:
                success_count += 1
        except Exception as e:
            print(f"      {version_type}: FAILED - {e}")
    
    print(f"\n   ✅ Created {success_count}/7 versions")
    return success_count == 7


# ========================================
# BATCH PROCESSING
# ========================================
def process_folder(input_folder, output_folder):
    """Process all videos in folder"""
    os.makedirs(output_folder, exist_ok=True)
    
    video_extensions = {'.mp4', '.mov', '.avi', '.MP4', '.MOV', '.AVI', '.mkv', '.MKV'}
    video_files = []
    
    if os.path.isdir(input_folder):
        for filename in os.listdir(input_folder):
            if Path(filename).suffix in video_extensions:
                video_files.append(os.path.join(input_folder, filename))
    
    if not video_files:
        print(f"❌ No video files found in: {input_folder}")
        return False
    
    print(f"\n📁 Found {len(video_files)} video(s)")
    print(f"📂 Output folder: {output_folder}")
    print(f"📊 Will create 7 versions per video (Total: {len(video_files) * 7} files)")
    
    success_count = 0
    
    for i, video_path in enumerate(video_files, 1):
        print(f"\n[{i}/{len(video_files)}]")
        if process_all_versions(video_path, output_folder):
            success_count += 1
    
    print("\n" + "=" * 70)
    print("BATCH PROCESSING COMPLETE")
    print("=" * 70)
    print(f"✅ Videos processed: {success_count}/{len(video_files)}")
    print(f"📂 Total output files: {success_count * 7}")
    print(f"📂 Output folder: {output_folder}")
    
    return success_count > 0


# ========================================
# MAIN
# ========================================
if __name__ == "__main__":
    print("=" * 70)
    print("Tennis Motion Analysis - Multi-Version Export")
    print("=" * 70)
    print(f"\nPlayer: {PLAYER_HAND.upper()}-handed ({SIDE_TEXT})")
    print("\n7 Versions per video:")
    print("  1. Wrist trail only")
    print("  2. Elbow trail only")
    print("  3. Hip + Shoulder trails")
    print("  4. Knee flexion")
    print("  5. Hip-Shoulder separation")
    print("  6. Hitting plane")
    print("  7. Complete (all features)")
    print()
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_folder = os.path.join(script_dir, "input")
    output_folder = os.path.join(script_dir, "output")
    
    if os.path.isdir(input_folder):
        print("🔍 Batch mode: Processing all videos in 'input' folder")
        success = process_folder(input_folder, output_folder)
    else:
        print("❌ ERROR: 'input' folder not found!")
        print(f"\nPlease create an 'input' folder and place your videos there:")
        print(f"  {input_folder}")
        exit(1)
    
    if success:
        print("\n" + "=" * 70)
        print("✅ ALL PROCESSING COMPLETE!")
        print("=" * 70)
    else:
        print("\n" + "=" * 70)
        print("❌ PROCESSING FAILED")
        print("=" * 70)