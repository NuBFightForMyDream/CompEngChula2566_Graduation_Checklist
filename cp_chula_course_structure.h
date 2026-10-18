// defining structure
# ifndef CHULA_COURSE_STRUCTURE_H
# define CHULA_COURSE_STRUCTURE_H

// including libraries
# include <iostream> 
# include <string> 
# include <map> 
# include <vector>
# include <set>
# include <utility> 
# include <algorithm> 
using namespace std ; 

// defining structure for course and taken course 

class Course { 
    public : 
        // attributes 
        map<string , string> category ; // main:sub Ex : "core_course" : "hardware"
        string grade ;
        set<string> prerequisite ; // using set for faster search 
        int credit ; 
        string code ;
        string course_name ; 

        // constructors
        Course(string code , string name , int credit) { 
            this -> code = code ; 
            this -> credit = credit ; 
            this -> course_name = name ; 
        }

        // methods 
        double calculate_grade(string received_grade) {

            vector<string> grade_letter = {"A","B+","B","C+","C","D+","D","F","W","S","U"} ;
            vector<double> grade_value = {4.0 , 3.5 , 3.0 , 2.5 , 2.0 , 1.5 , 1.0 , 0.0 , 0.0 , 0.0} ;

            auto grade_itr = find(grade_letter.begin() , grade_letter.end() , received_grade) ;
            if (grade_itr == grade_letter.end()) return -1 ; // grade not found 
            
            int grade_index = grade_itr - grade_letter.begin() ; 
            return grade_value[grade_index] ; 
        }

        double set_prerequisite(set<string> prerequisite) { 
            this -> prerequisite = prerequisite ; 
        }

} 

struct TakenCourse { 
    // This struct is just to check if code already enrolled 
    // So , storing "string" is better than storing in "course" for checking prerequisites

    // define storage for each category 
    set<string> all_taken_courses ; // This will store all taken course

    // Total 138++ credits 
    set<string> gened_general ; // 12 credits
    set<string> gened_english ; // 12 credits 
    set<string> gened_special ; // 6 credits (comp eng ess , explore)
    
    set<string> science_math ; // 21 credits (cal 6 phy 8 stat 3 chem 4)

    set<string> cen21_course ; // 6 credits (2100xxx)
    set<string> free_elective ; // 6 credits (for indirect cp5X will be drawing & material)

    set<string> core_engineering ; // 11 credits 
    set<string> core_required ; 
        // 40 credits (programming 17 , hardware 9 , system 7 , software 7)
    set<string> core_elective ; // 6 credits
    set<string> core_approved ; // 18 credits
}
;

// end of defining course structure
# endif