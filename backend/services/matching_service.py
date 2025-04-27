from models.models import User, Task
from typing import List

async def match_tasks_to_users(tasks: List[Task], users: List[User]):
    for task in tasks:
        best_match = None
        max_matching_skills = -1
        
        for user in users:
            matching_skills = sum(1 for skill in task.required_skills if skill.lower() in [s.lower() for s in user.skills])
            if matching_skills > max_matching_skills:
                max_matching_skills = matching_skills
                best_match = user
        
        if best_match:
            task.assigned_user = best_match.id
            task.assigned_user_email = best_match.email
    
    return tasks
