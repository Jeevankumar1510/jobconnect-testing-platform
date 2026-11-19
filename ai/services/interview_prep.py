import random
import re
from typing import Any

QUESTION_BANKS: dict[str, list[dict[str, Any]]] = {
    "Python": [
        {
            "id": "py-1",
            "category": "Python",
            "question": "What is the difference between mutable and immutable data types in Python? Give examples of both and explain memory implications.",
            "difficulty": "Fresher",
            "key_concepts": ["Mutable vs Immutable", "Lists/Dicts vs Tuples/Strings", "id() and Memory Address", "In-place modification"],
            "ideal_answer": "In Python, mutable objects can be modified after creation without changing their memory identity, whereas immutable objects cannot be altered; any modification creates a new object in memory. Common mutable types are lists, dictionaries, and sets. Immutable types include integers, floats, strings, tuples, and frozensets. Understanding this distinction is crucial when passing arguments to functions: mutable objects passed by reference can be modified inside the function, leading to unintended side effects if not handled with copies (e.g. copy.deepcopy).",
            "communication_tips": "State definitions clearly first, give 2-3 concrete examples of each, and mention function argument passing as a real-world gotcha."
        },
        {
            "id": "py-2",
            "category": "Python",
            "question": "Explain how Python manages memory, specifically focusing on reference counting and the garbage collector.",
            "difficulty": "Fresher",
            "key_concepts": ["Reference Counting", "Cyclic Garbage Collection", "Generational GC", "sys.getrefcount()"],
            "ideal_answer": "Python uses reference counting as its primary memory management mechanism. Every object has a counter tracking how many references point to it. When an object's reference count drops to zero, its memory is deallocated immediately. To handle reference cycles (where two objects refer to each other and their reference counts never reach zero), Python uses a cyclic garbage collector that divides objects into three generations (Generation 0, 1, and 2) based on survival time and periodically sweeps for unreachable cycles.",
            "communication_tips": "Use the generation analogy (younger objects collected more frequently) to demonstrate depth."
        },
        {
            "id": "py-3",
            "category": "Python",
            "question": "What are Python generators and decorators? When would you use a generator instead of a regular list?",
            "difficulty": "Junior",
            "key_concepts": ["yield keyword", "Lazy Evaluation", "Memory Efficiency", "Higher-Order Functions", "Decorators (@)"],
            "ideal_answer": "Generators are functions that use the 'yield' statement instead of 'return' to produce a sequence of values lazily on demand. Unlike lists, which allocate all elements in RAM simultaneously, generators compute one element at a time using the iterator protocol, resulting in O(1) memory usage regardless of dataset size. Decorators are functions that accept another function as an argument, extend or modify its behavior without altering its source code, and return a new function (useful for logging, authentication, and execution timing).",
            "communication_tips": "Highlight the memory-efficiency benefit when reading huge files or processing millions of database rows."
        },
        {
            "id": "py-4",
            "category": "Python",
            "question": "What is the Python GIL (Global Interpreter Lock), and how does it impact multi-threading vs multi-processing?",
            "difficulty": "Junior",
            "key_concepts": ["GIL", "CPython thread safety", "CPU-bound vs I/O-bound", "multiprocessing module"],
            "ideal_answer": "The Global Interpreter Lock (GIL) is a mutex in CPython that prevents multiple native threads from executing Python bytecodes simultaneously to protect CPython's non-thread-safe memory management. For CPU-bound operations (e.g. heavy math, image processing), multi-threading does not provide true parallelism; developers should use the 'multiprocessing' module or external C libraries instead. However, for I/O-bound tasks (network requests, database queries, file reads), threads or asyncio yield the lock while waiting, allowing high concurrency.",
            "communication_tips": "Clearly distinguish between CPU-bound tasks (use multiprocessing) and I/O-bound tasks (use asyncio or threads)."
        }
    ],
    "SQL": [
        {
            "id": "sql-1",
            "category": "SQL",
            "question": "What is the difference between INNER JOIN, LEFT JOIN, and FULL OUTER JOIN? Illustrate with an example.",
            "difficulty": "Fresher",
            "key_concepts": ["INNER JOIN", "LEFT JOIN", "FULL OUTER JOIN", "NULL values", "Relational Mapping"],
            "ideal_answer": "An INNER JOIN returns only records that have matching values in both tables. A LEFT JOIN returns all rows from the left table, along with matching rows from the right table; if there is no match, NULL values are filled for right-table columns. A FULL OUTER JOIN returns all rows when there is a match in either left or right table, filling NULLs where no match exists. For example, joining a 'Candidates' table with an 'Applications' table using LEFT JOIN displays every candidate, even those who haven't submitted any applications yet.",
            "communication_tips": "Give a simple real-world database scenario (Users and Orders, or Candidates and Applications) to explain the output difference."
        },
        {
            "id": "sql-2",
            "category": "SQL",
            "question": "Explain database indexing. What data structure is commonly used for indexes, and what is the trade-off of having too many indexes?",
            "difficulty": "Fresher",
            "key_concepts": ["B-Tree / B+ Tree", "Index scan vs Sequential scan", "Write Overhead (INSERT/UPDATE)", "Disk space"],
            "ideal_answer": "A database index is a data structure—most commonly a B+ Tree—that allows the database engine to locate specific rows quickly without scanning the entire table (sequential scan), reducing search time from O(N) to O(log N). The trade-off is write overhead: whenever a row is inserted, updated, or deleted, every corresponding index on that table must also be updated and balanced, which slows down write operations and consumes extra disk storage.",
            "communication_tips": "Explain the phone book index analogy, and explicitly mention the write penalty (slow INSERT/UPDATE)."
        },
        {
            "id": "sql-3",
            "category": "SQL",
            "question": "What are ACID properties in relational database transactions? Explain each component.",
            "difficulty": "Fresher",
            "key_concepts": ["Atomicity", "Consistency", "Isolation", "Durability", "Transactions (COMMIT/ROLLBACK)"],
            "ideal_answer": "ACID stands for Atomicity, Consistency, Isolation, and Durability. Atomicity ensures that all operations in a transaction succeed together or none occur ('all or nothing'). Consistency ensures that a transaction takes the database from one valid state to another, preserving all schema constraints. Isolation ensures that concurrent transactions do not interfere with one another (preventing dirty reads and phantom reads). Durability guarantees that once a transaction is committed, its changes survive system crashes or power outages (usually through write-ahead logs).",
            "communication_tips": "Use a bank fund transfer example (debiting Account A and crediting Account B) to demonstrate Atomicity."
        }
    ],
    "Java": [
        {
            "id": "java-1",
            "category": "Java",
            "question": "What are the four pillars of Object-Oriented Programming (OOP) in Java, and how are they implemented?",
            "difficulty": "Fresher",
            "key_concepts": ["Encapsulation", "Inheritance", "Polymorphism", "Abstraction", "Interface / Abstract class"],
            "ideal_answer": "The four pillars are: 1. Encapsulation: Bundling data and methods into a single class and restricting direct access via private fields with public getters/setters. 2. Abstraction: Hiding internal implementation details and showing only essential features using abstract classes and interfaces. 3. Inheritance: Reusing code from an existing parent class using the 'extends' keyword. 4. Polymorphism: Performing a single action in different ways via Method Overloading (compile-time) and Method Overriding (runtime).",
            "communication_tips": "Keep the definition crisp, give a quick real-world vehicle or animal hierarchy example, and contrast overloading vs overriding."
        },
        {
            "id": "java-2",
            "category": "Java",
            "question": "Explain the difference between String, StringBuilder, and StringBuffer in Java.",
            "difficulty": "Fresher",
            "key_concepts": ["String Immutability", "String Constant Pool", "StringBuilder (not thread-safe)", "StringBuffer (synchronized)"],
            "ideal_answer": "String objects in Java are immutable; any concatenation creates a new String in the String Constant Pool. When performing frequent modifications inside loops, this causes memory churn. StringBuffer and StringBuilder are mutable sequence buffers. StringBuffer is synchronized and thread-safe, making it suitable for multi-threaded environments, whereas StringBuilder is not synchronized, making it significantly faster and the preferred choice for single-threaded string manipulations.",
            "communication_tips": "Mention the performance cost of String concatenation in loops and when StringBuilder should be chosen."
        }
    ],
    "AWS": [
        {
            "id": "aws-1",
            "category": "AWS",
            "question": "What are the key differences between AWS EC2, S3, and Lambda? When should each be used?",
            "difficulty": "Fresher",
            "key_concepts": ["EC2 (IaaS / VM)", "S3 (Object Storage)", "Lambda (Serverless / FaaS)", "Pricing model"],
            "ideal_answer": "Amazon EC2 provides virtual servers (Infrastructure as a Service) where you manage the OS, runtime, and server configuration—ideal for long-running web servers, monolithic applications, and custom software stacks. Amazon S3 is scalable object storage designed for storing unstructured files like images, PDFs, backups, and static website assets with 99.999999999% (11 9s) durability. AWS Lambda is a serverless Function-as-a-Service (FaaS) where you run event-driven code without provisioning servers, paying only for the execution duration (measured in milliseconds)—ideal for webhooks, file processing triggers, and microservices.",
            "communication_tips": "Structure by compute vs storage, and compare cost/management trade-offs between dedicated servers vs serverless."
        }
    ],
    "AI/ML": [
        {
            "id": "ai-1",
            "category": "AI/ML",
            "question": "What is the difference between Supervised, Unsupervised, and Reinforcement Learning? Provide examples.",
            "difficulty": "Fresher",
            "key_concepts": ["Labeled data", "Unlabeled data / Clustering", "Reward & Penalty agent", "Classification / Regression"],
            "ideal_answer": "Supervised Learning trains models on labeled input-output pairs to predict continuous values (regression) or discrete categories (classification)—e.g., predicting house prices or spam filtering. Unsupervised Learning discovers hidden patterns, groupings, or distributions in unlabeled data—e.g., customer segmentation via K-Means or dimensionality reduction via PCA. Reinforcement Learning involves an autonomous agent learning optimal decision-making strategies through trial and error, receiving rewards or penalties from an environment—e.g., game playing (AlphaGo) or robotic control.",
            "communication_tips": "Give clear industry examples for each category so the interviewer sees practical understanding."
        },
        {
            "id": "ai-2",
            "category": "AI/ML",
            "question": "What is Retrieval-Augmented Generation (RAG), and why is it preferred over fine-tuning for enterprise domain knowledge?",
            "difficulty": "Junior",
            "key_concepts": ["RAG Architecture", "Vector Embeddings", "Semantic Search", "Hallucination Reduction", "Cost & Freshness"],
            "ideal_answer": "Retrieval-Augmented Generation (RAG) is an AI architecture that enhances Large Language Models by retrieving relevant authoritative documents from an external vector database before feeding them as context into the LLM prompt. Compared to fine-tuning, RAG is substantially cheaper, prevents hallucinations by grounding responses in verified source data, provides citations, and allows instant knowledge updates simply by adding new documents to the vector store without expensive model retraining.",
            "communication_tips": "Highlight the hallucination reduction and ability to update knowledge dynamically without retraining."
        }
    ],
    "React": [
        {
            "id": "react-1",
            "category": "React",
            "question": "Explain the Virtual DOM in React and how the reconciliation diffing algorithm works.",
            "difficulty": "Fresher",
            "key_concepts": ["Virtual DOM", "Reconciliation", "Diffing Algorithm", "Batching", "DOM performance"],
            "ideal_answer": "The Virtual DOM is an in-memory lightweight JavaScript representation of the real DOM. When component state changes, React creates a new Virtual DOM tree and compares it with the previous tree using a heuristic O(N) diffing algorithm (reconciliation). React identifies the exact minimal set of changes required and batches these updates to modify only the necessary parts of the real DOM, minimizing expensive browser layout reflows and repaints.",
            "communication_tips": "Emphasize that updating the real DOM is computationally expensive and that the Virtual DOM minimizes layout thrashing."
        }
    ],
    "HR": [
        {
            "id": "hr-1",
            "category": "HR",
            "question": "Tell me about a challenging project or bug you faced, and how you resolved it.",
            "difficulty": "Fresher",
            "key_concepts": ["STAR method (Situation, Task, Action, Result)", "Ownership", "Problem Solving", "Learning outcome"],
            "ideal_answer": "Structure using the STAR framework: 1. Situation: Describe the project context and deadline. 2. Task: State what your specific responsibility was. 3. Action: Explain the methodical steps you took (e.g. debugging logs, consulting documentation, testing edge cases, refactoring). 4. Result: Conclude with the positive measurable outcome (e.g. fixed the bug, improved performance by 30%, delivered on time) and what you learned from the experience.",
            "communication_tips": "Use the STAR method explicitly: Situation (15%), Task (15%), Action (50%), Result (20%). Focus on your own contributions ('I investigated' rather than 'We')."
        },
        {
            "id": "hr-2",
            "category": "HR",
            "question": "Why do you want to join our company as a fresher software engineer?",
            "difficulty": "Fresher",
            "key_concepts": ["Company research", "Tech stack alignment", "Growth mindset", "Value proposition"],
            "ideal_answer": "Express genuine interest based on the company's domain, products, and tech stack. Connect your academic/personal projects with what the team is building. Emphasize your eagerness to learn from senior engineers, your strong foundation in software principles, and your commitment to contributing high-quality code and solving customer problems.",
            "communication_tips": "Avoid generic answers like 'good culture'; mention a specific technology, product feature, or company milestone that excites you."
        }
    ]
}


def get_random_questions_for_category(category: str, count: int = 5) -> list[dict[str, Any]]:
    """
    Retrieves random interview questions for a category.
    """
    bank = QUESTION_BANKS.get(category)
    if not bank:
        # Fallback to Python if unknown
        bank = QUESTION_BANKS.get("Python", [])
    selected = random.sample(bank, min(count, len(bank)))
    return selected


def evaluate_candidate_answer(
    question_text: str,
    ideal_answer: str,
    key_concepts: list[str],
    user_answer: str,
) -> dict[str, Any]:
    """
    Evaluates candidate's answer against key concepts and ideal answer,
    producing a score (0-10), strengths, areas for improvement, and communication coaching.
    """
    answer_clean = user_answer.strip()
    words = answer_clean.split()
    word_count = len(words)

    if word_count < 5:
        return {
            "score": 1,
            "ai_feedback": "Your answer is too short to evaluate. Please provide a detailed explanation showing your technical reasoning.",
            "strengths": [],
            "improvements": ["Elaborate on core concepts", "Include examples or code logic", "Structure your answer"],
            "ideal_answer": ideal_answer,
            "communication_tips": "In interviews, aim for 2-4 structured sentences or a full paragraph explaining definitions, examples, and trade-offs."
        }

    matched_concepts: list[str] = []
    missing_concepts: list[str] = []
    answer_lower = answer_clean.lower()

    for concept in key_concepts:
        # Check if words from the concept appear in answer
        concept_terms = [t.lower() for t in re.split(r"[\s/(),]+", concept) if len(t) > 2]
        if any(term in answer_lower for term in concept_terms):
            matched_concepts.append(concept)
        else:
            missing_concepts.append(concept)

    # Base score on concept coverage and depth
    concept_ratio = len(matched_concepts) / len(key_concepts) if key_concepts else 0.5
    raw_score = int(concept_ratio * 7)

    # Bonus points for depth and length
    if word_count >= 50:
        raw_score += 2
    elif word_count >= 25:
        raw_score += 1

    # Check for examples or keywords
    if any(k in answer_lower for k in ["for example", "e.g.", "such as", "because", "advantage", "tradeoff", "instance"]):
        raw_score += 1

    final_score = min(max(raw_score, 2), 10)

    strengths: list[str] = []
    improvements: list[str] = []

    if matched_concepts:
        strengths.append(f"Correctly identified key concepts: {', '.join(matched_concepts)}.")
    if word_count >= 40:
        strengths.append("Good elaboration and sentence flow.")

    if missing_concepts:
        improvements.append(f"Missed addressing: {', '.join(missing_concepts)}.")
    if not any(k in answer_lower for k in ["example", "e.g."]):
        improvements.append("Support your points with a concrete code or real-world example.")

    if final_score >= 8:
        feedback = f"Excellent answer! You demonstrated strong conceptual understanding and covered {len(matched_concepts)}/{len(key_concepts)} critical points."
    elif final_score >= 5:
        feedback = f"Good foundational attempt. You covered key ideas but can add more precision regarding {missing_concepts[0] if missing_concepts else 'trade-offs'}."
    else:
        feedback = "Needs improvement. Your answer touched on the topic but lacked depth on core technical mechanisms."

    return {
        "score": final_score,
        "ai_feedback": feedback,
        "strengths": strengths,
        "improvements": improvements,
        "ideal_answer": ideal_answer,
        "communication_tips": "Practice using the 'Definition -> Example -> Trade-off' framework to structure technical answers smoothly."
    }
